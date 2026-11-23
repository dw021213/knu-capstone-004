package api

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type kmaWeatherItem struct {
	weatherGrid
	BaseDate string          `json:"baseDate"`
	BaseTime string          `json:"baseTime"`
	FCDate   string          `json:"fcstDate"`
	FCTime   string          `json:"fcstTime"`
	Category string          `json:"category"`
	Observed json.RawMessage `json:"obsrValue"`
	Forecast json.RawMessage `json:"fcstValue"`
}

func (w *WeatherClient) fetchReading(key weatherCacheKey) (weatherReading, error) {
	baseAt := key.baseAt
	params := url.Values{
		"serviceKey": {w.key},
		"dataType":   {"JSON"},
		"pageNo":     {"1"},
		"numOfRows":  {"1000"},
		"base_date":  {baseAt.Format("20060102")},
		"base_time":  {baseAt.Format("1504")},
		"nx":         {strconv.Itoa(key.grid.NX)},
		"ny":         {strconv.Itoa(key.grid.NY)},
	}
	items, err := w.kmaItems(key.product, params)
	if err != nil {
		return weatherReading{}, err
	}
	if len(items) == 0 {
		return weatherReading{}, errWeatherNoData
	}

	isForecast := key.product == kmaForecast
	publishedAt, err := time.ParseInLocation("200601021504", items[0].BaseDate+items[0].BaseTime, kmaKST)
	// Forecast requests use :30, but the portal can report an earlier base time in that hour.
	if err != nil || publishedAt.After(baseAt) || publishedAt.Before(baseAt.Truncate(time.Hour)) {
		return weatherReading{}, errWeatherUpstream
	}
	publishedDate, publishedTime := publishedAt.Format("20060102"), publishedAt.Format("1504")
	source, validAt := "observation", baseAt
	if isForecast {
		source, validAt = "forecast", baseAt.Add(30*time.Minute)
	}
	validDate, validTime := validAt.Format("20060102"), validAt.Format("1504")
	values := make(map[string]string)
	for _, item := range items {
		if item.weatherGrid != key.grid || item.BaseDate != publishedDate || item.BaseTime != publishedTime {
			return weatherReading{}, errWeatherUpstream
		}
		value := item.Observed
		if isForecast {
			if item.FCDate != validDate || item.FCTime != validTime {
				continue
			}
			value = item.Forecast
		}
		values[item.Category] = kmaValueText(value)
	}

	temp, hasTemp := kmaNumber(values["T1H"])
	humidity, hasHumidity := kmaNumber(values["REH"])
	wind, hasWind := kmaNumber(values["WSD"])
	rain, rainText := kmaRain(values["RN1"], isForecast)
	if !hasTemp || !hasHumidity || humidity < 0 || humidity > 100 || !hasWind || wind < 0 || (rain == nil && rainText == "") {
		return weatherReading{}, errWeatherNoData
	}

	reading := weatherReading{
		Source: source, BaseAt: publishedAt, ValidAt: validAt, FetchedAt: w.now().In(kmaKST),
		TemperatureC: temp, HumidityPct: humidity, WindSpeedMPS: wind,
		Precipitation1HMM: rain, Precipitation1HText: rainText,
	}
	if direction, ok := kmaNumber(values["VEC"]); ok && direction >= 0 && direction <= 360 {
		reading.WindDirectionDeg = &direction
	}
	if kind, err := strconv.Atoi(values["PTY"]); err == nil && kind >= 0 && kind <= 7 {
		reading.PrecipitationTypeCode = &kind
	}
	return reading, nil
}

func (w *WeatherClient) kmaItems(product string, params url.Values) ([]kmaWeatherItem, error) {
	resp, err := w.http.Get(kmaEndpoint + product + "?" + params.Encode())
	if err != nil {
		// The raw HTTP error can embed the request URL and service key.
		return nil, weatherRequestError(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, errWeatherQuota
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errWeatherUpstream
	}
	const maxResponseBytes = 1 << 20
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil {
		return nil, weatherRequestError(err)
	}
	if len(raw) > maxResponseBytes {
		return nil, errWeatherUpstream
	}

	var envelope struct {
		Response struct {
			Header struct {
				Code string `json:"resultCode"`
			} `json:"header"`
			Body json.RawMessage `json:"body"`
		} `json:"response"`
	}
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	if err := json.Unmarshal(raw, &envelope); err != nil {
		// The gateway can return an XML error even when JSON was requested.
		var gateway struct {
			XMLName xml.Name `xml:"OpenAPI_ServiceResponse"`
			Code    string   `xml:"cmmMsgHeader>returnReasonCode"`
		}
		if xml.Unmarshal(raw, &gateway) == nil {
			return nil, kmaResultError(gateway.Code)
		}
		return nil, errWeatherUpstream
	}
	if envelope.Response.Header.Code != "00" {
		return nil, kmaResultError(envelope.Response.Header.Code)
	}
	var body struct {
		Items struct {
			Rows []kmaWeatherItem `json:"item"`
		} `json:"items"`
	}
	if err := json.Unmarshal(envelope.Response.Body, &body); err != nil {
		return nil, errWeatherUpstream
	}
	return body.Items.Rows, nil
}

func kmaResultError(code string) error {
	switch strings.TrimSpace(code) {
	case "03":
		return errWeatherNoData
	case "22":
		return errWeatherQuota
	default:
		return errWeatherUpstream
	}
}

func weatherRequestError(err error) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return context.DeadlineExceeded
	}
	return errWeatherUpstream
}

func kmaValueText(raw json.RawMessage) string {
	text := string(raw)
	if len(raw) > 0 && raw[0] == '"' {
		_ = json.Unmarshal(raw, &text)
	}
	return strings.TrimSpace(text)
}

func kmaNumber(raw string) (float64, bool) {
	v, err := strconv.ParseFloat(raw, 64)
	// KMA uses values such as -999 and -998.9 for missing measurements.
	return v, err == nil && math.Abs(v) < 900
}

var kmaRainRange = regexp.MustCompile(`^(?:[0-9]+(?:\.[0-9]+)?mm(?:미만|이상)|[0-9]+(?:\.[0-9]+)?(?:mm)?[~～][0-9]+(?:\.[0-9]+)?mm)$`)

func kmaRain(raw string, forecast bool) (*float64, string) {
	value := raw
	if forecast {
		value = strings.Join(strings.Fields(raw), "")
		if value == "강수없음" {
			zero := 0.0
			return &zero, ""
		}
		if kmaRainRange.MatchString(value) {
			return nil, raw
		}
		value = strings.TrimSuffix(value, "mm")
	}
	if rain, ok := kmaNumber(value); ok && rain >= 0 {
		return &rain, ""
	}
	return nil, ""
}
