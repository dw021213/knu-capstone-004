package api

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"jejurisk/internal/geo"
)

const (
	kmaEndpoint    = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/"
	kmaObservation = "getUltraSrtNcst"
	kmaForecast    = "getUltraSrtFcst"
)

var (
	kmaKST             = time.FixedZone("KST", 9*60*60)
	errWeatherNoData   = errors.New("KMA weather data unavailable for grid and time")
	errWeatherUpstream = errors.New("KMA weather request failed")
	errWeatherQuota    = errors.New("KMA weather request quota exceeded")
)

type weatherGrid struct {
	NX int `json:"nx"`
	NY int `json:"ny"`
}

type weatherReading struct {
	Source                string    `json:"source"`
	BaseAt                time.Time `json:"base_at"`
	ValidAt               time.Time `json:"valid_at"`
	FetchedAt             time.Time `json:"fetched_at"`
	TemperatureC          float64   `json:"temperature_c"`
	HumidityPct           float64   `json:"humidity_pct"`
	WindSpeedMPS          float64   `json:"wind_speed_mps"`
	WindDirectionDeg      *float64  `json:"wind_direction_deg"`
	Precipitation1HMM     *float64  `json:"precipitation_1h_mm"`
	Precipitation1HText   string    `json:"precipitation_1h_text,omitempty"`
	PrecipitationTypeCode *int      `json:"precipitation_type_code"`
}

type weatherResult struct {
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
	Cached bool    `json:"cached"`
	weatherGrid
	weatherReading
}

type weatherCacheKey struct {
	grid    weatherGrid
	product string
	baseAt  time.Time
}

type weatherCacheEntry struct {
	ready   chan struct{}
	retryAt time.Time // Protected by WeatherClient.mu; zero means valid for this base time.
	reading weatherReading
	err     error
}

type WeatherClient struct {
	key  string
	http *http.Client
	now  func() time.Time

	mu           sync.Mutex
	cache        map[weatherCacheKey]*weatherCacheEntry
	lastPrunedAt time.Time
}

func NewWeatherClient() *WeatherClient {
	key := serverAPIKey("KMA_SERVICE_KEY")
	if decoded, err := url.PathUnescape(key); err == nil {
		key = decoded // Public Data Portal also distributes percent-encoded service keys.
	}
	return &WeatherClient{
		key: key,
		http: &http.Client{
			Timeout:       8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		now:   time.Now,
		cache: make(map[weatherCacheKey]*weatherCacheEntry),
	}
}

func (w *WeatherClient) Register(r gin.IRouter) {
	r.GET("/weather/live", w.live)
}

func (w *WeatherClient) live(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	query, queryErr := url.ParseQuery(c.Request.URL.RawQuery)
	lat, latErr := strconv.ParseFloat(strings.TrimSpace(query.Get("lat")), 64)
	lng, lngErr := strconv.ParseFloat(strings.TrimSpace(query.Get("lng")), 64)
	if queryErr != nil || len(query["lat"]) != 1 || len(query["lng"]) != 1 || latErr != nil || lngErr != nil ||
		!(lat >= 32.9 && lat <= 34.2 && lng >= 125.9 && lng <= 127.2) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "제주 위도 lat(32.9~34.2)와 경도 lng(125.9~127.2)를 입력하세요."})
		return
	}
	if w.key == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "기상청 조회 키가 설정되지 않았습니다."})
		return
	}

	nx, ny := geo.KMAWeatherGrid(lat, lng)
	grid := weatherGrid{NX: nx, NY: ny}
	ctx := c.Request.Context()
	now := w.now().In(kmaKST)
	// The portal serves hourly observations from ten minutes past the hour.
	observationBase := now.Add(-10 * time.Minute).Truncate(time.Hour)
	reading, cached, err := w.lookup(ctx, weatherCacheKey{grid, kmaObservation, observationBase})
	if errors.Is(err, errWeatherNoData) {
		// The previous hour's :30 forecast includes this hour, including at midnight KST.
		forecastBase := now.Truncate(time.Hour).Add(-30 * time.Minute)
		reading, cached, err = w.lookup(ctx, weatherCacheKey{grid, kmaForecast, forecastBase})
	}

	switch {
	case err == nil:
		c.JSON(http.StatusOK, weatherResult{Lat: lat, Lng: lng, Cached: cached, weatherGrid: grid, weatherReading: reading})
	case errors.Is(err, context.Canceled):
		return
	case errors.Is(err, errWeatherNoData):
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 위치의 날씨 자료가 없습니다."})
	case errors.Is(err, errWeatherQuota):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "기상청 조회 한도에 도달했습니다."})
	case errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "기상청 응답 시간이 초과되었습니다."})
	default:
		c.JSON(http.StatusBadGateway, gin.H{"error": "기상청 날씨를 불러오지 못했습니다."})
	}
}

func (w *WeatherClient) lookup(ctx context.Context, key weatherCacheKey) (weatherReading, bool, error) {
	now := w.now()
	w.mu.Lock()
	// Requests on either side of an hourly boundary can share their respective publications.
	if now.Sub(w.lastPrunedAt) >= time.Hour {
		cutoff := now.Add(-2 * time.Hour)
		for retained := range w.cache {
			if retained.baseAt.Before(cutoff) {
				delete(w.cache, retained)
			}
		}
		w.lastPrunedAt = now
	}
	entry := w.cache[key]
	shared := entry != nil && (entry.retryAt.IsZero() || now.Before(entry.retryAt))
	if !shared {
		entry = &weatherCacheEntry{ready: make(chan struct{})}
		w.cache[key] = entry
		// The HTTP timeout bounds this request even if the first caller disconnects.
		go w.loadReading(key, entry)
	}
	w.mu.Unlock()

	select {
	case <-ctx.Done():
		return weatherReading{}, false, ctx.Err()
	case <-entry.ready:
		return entry.reading, shared, entry.err
	}
}

func (w *WeatherClient) loadReading(key weatherCacheKey, entry *weatherCacheEntry) {
	entry.reading, entry.err = w.fetchReading(key)
	if entry.err != nil {
		delay := time.Minute
		if errors.Is(entry.err, errWeatherNoData) {
			delay = 5 * time.Minute
		}
		w.mu.Lock()
		entry.retryAt = w.now().Add(delay)
		w.mu.Unlock()
	}
	close(entry.ready)
}
