package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type weatherTestTransport func(*http.Request) (*http.Response, error)

func (f weatherTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func weatherTestRouter(t *testing.T, now func() time.Time, transport weatherTestTransport) *gin.Engine {
	t.Helper()
	t.Setenv("KMA_SERVICE_KEY", "test%2Bkey%3D")
	client := NewWeatherClient()
	client.now = now
	client.http.Transport = transport
	gin.SetMode(gin.TestMode)
	router := gin.New()
	client.Register(router.Group("/api"))
	return router
}

func weatherQuery(router http.Handler, query string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/weather/live?"+query, nil))
	return w
}

func weatherJSON(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; response: %s", w.Code, w.Body)
	}
	var result map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func testKMAItems(req *http.Request, valueKey, validDate, validTime string, values map[string]any) []map[string]any {
	q := req.URL.Query()
	nx, _ := strconv.Atoi(q.Get("nx"))
	ny, _ := strconv.Atoi(q.Get("ny"))
	items := make([]map[string]any, 0, len(values))
	for category, value := range values {
		items = append(items, map[string]any{
			"nx": nx, "ny": ny, "baseDate": q.Get("base_date"), "baseTime": q.Get("base_time"),
			"fcstDate": validDate, "fcstTime": validTime, "category": category, valueKey: value,
		})
	}
	return items
}

func testKMAResponse(code string, items []map[string]any) *http.Response {
	w := httptest.NewRecorder()
	_ = json.NewEncoder(w).Encode(map[string]any{"response": map[string]any{
		"header": map[string]string{"resultCode": code},
		"body":   map[string]any{"items": map[string]any{"item": items}},
	}})
	return w.Result()
}

func TestWeatherObservationUsesJejuGridAndRefreshesAfterPublication(t *testing.T) {
	now := time.Date(2026, 11, 23, 0, 9, 0, 0, time.UTC) // 09:09 KST
	var bases []string
	router := weatherTestRouter(t, func() time.Time { return now }, func(req *http.Request) (*http.Response, error) {
		q := req.URL.Query()
		if req.URL.Host != "apis.data.go.kr" || !strings.HasSuffix(req.URL.Path, "/getUltraSrtNcst") ||
			q.Get("serviceKey") != "test+key=" || q.Get("nx") != "53" || q.Get("ny") != "38" || q.Get("dataType") != "JSON" {
			t.Error("expected request for Jeju City observations using the configured key")
		}
		bases = append(bases, q.Get("base_date")+q.Get("base_time"))
		return testKMAResponse("00", testKMAItems(req, "obsrValue", "", "", map[string]any{
			"T1H": "10.2", "RN1": 0, "REH": "56", "WSD": "2.9", "VEC": "-998", "PTY": "0",
		})), nil
	})
	const query = "lng=126.5312&lat=33.4996"
	first := weatherJSON(t, weatherQuery(router, query))
	second := weatherJSON(t, weatherQuery(router, "lng=126.5313&lat=33.4997"))
	if first["source"] != "observation" || first["base_at"] != "2026-11-23T08:00:00+09:00" ||
		first["valid_at"] != first["base_at"] || first["temperature_c"] != 10.2 || first["precipitation_1h_mm"] != float64(0) ||
		first["wind_direction_deg"] != nil || first["precipitation_type_code"] != float64(0) || first["cached"] != false {
		t.Fatalf("unexpected observation: %v", first)
	}
	if second["lat"] != 33.4997 || second["lng"] != 126.5313 || second["nx"] != float64(53) || second["ny"] != float64(38) ||
		second["cached"] != true || second["fetched_at"] != first["fetched_at"] || len(bases) != 1 {
		t.Fatalf("different coordinates in the same grid did not share observations: %v; requests: %v", second, bases)
	}
	now = now.Add(time.Minute)
	third := weatherJSON(t, weatherQuery(router, query))
	if third["valid_at"] != "2026-11-23T09:00:00+09:00" || third["cached"] != false ||
		strings.Join(bases, ",") != "202611230800,202611230900" {
		t.Fatalf("wrong publication time: %v; requests: %v", third, bases)
	}
}

func TestWeatherMissingObservationUsesCurrentHourForecastAcrossMidnight(t *testing.T) {
	now := time.Date(2026, 11, 22, 15, 5, 0, 0, time.UTC) // 00:05 KST
	var calls []string
	router := weatherTestRouter(t, func() time.Time { return now }, func(req *http.Request) (*http.Response, error) {
		q := req.URL.Query()
		if q.Get("nx") != "47" || q.Get("ny") != "36" || q.Get("base_date") != "20261122" {
			t.Error("expected western Jeju grid and previous day's publication")
		}
		calls = append(calls, q.Get("base_time"))
		if strings.HasSuffix(req.URL.Path, "/getUltraSrtNcst") {
			return testKMAResponse("00", testKMAItems(req, "obsrValue", "", "", map[string]any{
				"T1H": "-999", "RN1": "-998.9", "REH": "-998", "WSD": "-998.9", "PTY": "0",
			})), nil
		}
		if !strings.HasSuffix(req.URL.Path, "/getUltraSrtFcst") {
			t.Error("expected ultra-short-term forecast request")
		}
		rows := testKMAItems(req, "fcstValue", "20261123", "0100", map[string]any{
			"T1H": "99", "RN1": "강수없음", "REH": "80", "WSD": "7",
		})
		rows = append(rows, testKMAItems(req, "fcstValue", "20261123", "0000", map[string]any{
			"T1H": "14", "RN1": "1.0mm 미만", "REH": "65", "WSD": "7", "VEC": "180", "PTY": "1",
		})...)
		// The live gateway can return the hour as baseTime for a :30 forecast request.
		for _, row := range rows {
			row["baseTime"] = "2300"
		}
		return testKMAResponse("00", rows), nil
	})
	got := weatherJSON(t, weatherQuery(router, "lat=33.395277408&lng=126.245288624"))
	if strings.Join(calls, ",") != "2300,2330" || got["source"] != "forecast" ||
		got["base_at"] != "2026-11-22T23:00:00+09:00" || got["valid_at"] != "2026-11-23T00:00:00+09:00" ||
		got["temperature_c"] != float64(14) || got["wind_direction_deg"] != float64(180) ||
		got["precipitation_1h_mm"] != nil || got["precipitation_1h_text"] != "1.0mm 미만" {
		t.Fatalf("missing values were not replaced with the exact hour forecast: %v; requests: %v", got, calls)
	}
}

func TestWeatherUpstreamErrorsAndMissingData(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		wantCalls int
		transport weatherTestTransport
	}{
		{"both sources missing", http.StatusNotFound, 2, func(*http.Request) (*http.Response, error) {
			return testKMAResponse("03", nil), nil
		}},
		{"different grid", http.StatusBadGateway, 1, func(req *http.Request) (*http.Response, error) {
			items := testKMAItems(req, "obsrValue", "", "", map[string]any{"T1H": "10"})
			items[0]["nx"] = 1
			return testKMAResponse("00", items), nil
		}},
		{"gateway XML error", http.StatusBadGateway, 1, func(*http.Request) (*http.Response, error) {
			w := httptest.NewRecorder()
			fmt.Fprint(w, `<OpenAPI_ServiceResponse><returnAuthMsg>test+key=</returnAuthMsg></OpenAPI_ServiceResponse>`)
			return w.Result(), nil
		}},
		{"gateway XML quota", http.StatusServiceUnavailable, 1, func(*http.Request) (*http.Response, error) {
			w := httptest.NewRecorder()
			fmt.Fprint(w, `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`)
			return w.Result(), nil
		}},
		{"timeout", http.StatusGatewayTimeout, 1, func(*http.Request) (*http.Response, error) {
			return nil, context.DeadlineExceeded
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Date(2026, 11, 23, 1, 30, 0, 0, time.UTC)
			calls := 0
			router := weatherTestRouter(t, func() time.Time { return now }, func(req *http.Request) (*http.Response, error) {
				calls++
				return tc.transport(req)
			})
			w := weatherQuery(router, "lat=33.4996&lng=126.5312")
			if w.Code != tc.status || calls != tc.wantCalls || !json.Valid(w.Body.Bytes()) ||
				strings.Contains(w.Body.String(), "test+key=") || strings.Contains(w.Body.String(), "test%2Bkey") {
				t.Fatalf("status = %d, upstream calls = %d, body = %s", w.Code, calls, w.Body)
			}
		})
	}
}

func TestWeatherReusesBothPublicationsDuringHourRollover(t *testing.T) {
	t.Setenv("KMA_SERVICE_KEY", "test-key")
	client := NewWeatherClient()
	newer := time.Date(2026, 11, 23, 10, 0, 0, 0, kmaKST)
	client.now = func() time.Time { return newer.Add(10 * time.Minute) }
	calls := 0
	client.http.Transport = weatherTestTransport(func(req *http.Request) (*http.Response, error) {
		calls++
		return testKMAResponse("00", testKMAItems(req, "obsrValue", "", "", map[string]any{
			"T1H": "10", "RN1": 0, "REH": "60", "WSD": "1",
		})), nil
	})
	key := weatherCacheKey{grid: weatherGrid{NX: 53, NY: 38}, product: kmaObservation}
	older := newer.Add(-time.Hour)
	for _, base := range []time.Time{newer, older, older, newer} {
		key.baseAt = base
		reading, _, err := client.lookup(context.Background(), key)
		if err != nil || !reading.ValidAt.Equal(base) {
			t.Fatalf("lookup at %v returned %v with error %v", base, reading.ValidAt, err)
		}
	}
	if calls != 2 {
		t.Fatalf("lookups did not share both recent publications, %d upstream calls", calls)
	}
}

func TestWeatherAcceptsCoordinatesAlongTheMapEdge(t *testing.T) {
	now := time.Date(2026, 11, 23, 2, 20, 0, 0, time.UTC)
	router := weatherTestRouter(t, func() time.Time { return now }, func(req *http.Request) (*http.Response, error) {
		return testKMAResponse("00", testKMAItems(req, "obsrValue", "", "", map[string]any{
			"T1H": "10", "RN1": 0, "REH": "60", "WSD": "1",
		})), nil
	})
	for _, query := range []string{"lat=33.38&lng=125.95", "lat=32.95&lng=126.5", "lat=33.4&lng=127.15"} {
		if response := weatherQuery(router, query); response.Code != http.StatusOK {
			t.Errorf("map edge %s: got %d, want 200", query, response.Code)
		}
	}
}
