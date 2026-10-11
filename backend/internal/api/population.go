package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const populationUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
const populationColumns = "M_POP_00,M_POP_10,M_POP_20,M_POP_30,M_POP_40,M_POP_50,M_POP_60,M_POP_70,M_POP_80,M_POP_90,W_POP_00,W_POP_10,W_POP_20,W_POP_30,W_POP_40,W_POP_50,W_POP_60,W_POP_70,W_POP_80,W_POP_90"

type PopulationRow struct {
	Residents *int            `json:"IN_POP"`
	Visitors  *int            `json:"OUT_POP"`
	Time      json.RawMessage `json:"TIME"`
}
type PopulationResult struct {
	Lng        float64         `json:"lng"`
	Lat        float64         `json:"lat"`
	Radius     int             `json:"radius_m"`
	Residents  int             `json:"residents"`
	Visitors   int             `json:"visitors"`
	Total      int             `json:"total"`
	ObservedAt time.Time       `json:"observed_at"`
	FetchedAt  time.Time       `json:"fetched_at"`
	Cached     bool            `json:"cached"`
	Source     string          `json:"source"`
	History    []PopulationRow `json:"history"`
}
type PopulationClient struct {
	mu       sync.Mutex
	http     *http.Client
	endpoint string
	cache    map[string]PopulationResult
}

func NewPopulationClient() *PopulationClient {
	return &PopulationClient{http: &http.Client{Timeout: 15 * time.Second}, endpoint: "https://data.ijto.or.kr/api/datamap/mms/proxy.do", cache: make(map[string]PopulationResult)}
}
func (s *PopulationClient) request(ctx context.Context, params url.Values, dest any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", s.endpoint+"?"+params.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", populationUA)
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	if dest == nil {
		return nil
	}
	if text, ok := dest.(*string); ok {
		b, e := io.ReadAll(io.LimitReader(resp.Body, 4096))
		*text = string(b)
		return e
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(dest)
}
func (h *Handler) population(c *gin.Context) {
	lng, e1 := strconv.ParseFloat(c.Query("lng"), 64)
	lat, e2 := strconv.ParseFloat(c.Query("lat"), 64)
	radius, e3 := strconv.Atoi(c.DefaultQuery("radius", "1500"))
	if e1 != nil || e2 != nil || e3 != nil || math.IsNaN(lng) || math.IsNaN(lat) || math.IsInf(lng, 0) || math.IsInf(lat, 0) || lng < 126 || lng > 127.1 || lat < 33 || lat > 34.2 || radius < 500 || radius > 2000 || radius%50 != 0 {
		c.JSON(400, gin.H{"error": "제주 좌표 lng(126~127.1), lat(33~34.2), radius(500~2000m, 50m 단위)를 입력하세요"})
		return
	}
	s := h.Population
	if s == nil {
		c.JSON(503, gin.H{"error": "인구 조회 서비스 미설정"})
		return
	}
	// Six decimal places (~10cm); bounded in-memory cache, including concurrent duplicates.
	key := fmt.Sprintf("%.6f:%.6f:%d", lng, lat, radius)
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if r, ok := s.cache[key]; ok && now.Sub(r.FetchedAt) < 5*time.Minute {
		r.Cached = true
		c.JSON(200, r)
		return
	}
	params := url.Values{"api": {"GEONET.getTimePopByCircle"}, "SELECT": {populationColumns}, "X": {fmt.Sprintf("%.6f", lng)}, "Y": {fmt.Sprintf("%.6f", lat)}, "R": {strconv.Itoa(radius)}}
	var rows []PopulationRow
	if err := s.request(c.Request.Context(), params, &rows); err != nil {
		c.JSON(502, gin.H{"error": "제주 인구 데이터 조회 실패"})
		return
	}
	var current *PopulationRow
	for i := range rows {
		if string(rows[i].Time) == `"NOW"` {
			current = &rows[i]
			break
		}
	}
	if current == nil || current.Residents == nil || current.Visitors == nil || *current.Residents < 0 || *current.Visitors < 0 {
		c.JSON(502, gin.H{"error": "현재 인구 데이터 없음"})
		return
	}
	var stamp string
	if err := s.request(c.Request.Context(), url.Values{"api": {"GEONET.getTimeStamp"}}, &stamp); err != nil {
		c.JSON(502, gin.H{"error": "인구 집계 시각 조회 실패"})
		return
	}
	observed, err := time.ParseInLocation("20060102150405", strings.Split(strings.TrimSpace(stamp), "^")[0], time.FixedZone("KST", 9*3600))
	if err != nil {
		c.JSON(502, gin.H{"error": "인구 집계 시각 형식 오류"})
		return
	}
	r := PopulationResult{Lng: lng, Lat: lat, Radius: radius, Residents: *current.Residents, Visitors: *current.Visitors, Total: *current.Residents + *current.Visitors, ObservedAt: observed, FetchedAt: now, Source: "제주관광빅데이터플랫폼 / SKT", History: rows}
	for k, v := range s.cache {
		if now.Sub(v.FetchedAt) >= 5*time.Minute {
			delete(s.cache, k)
		}
	}
	if len(s.cache) >= 512 {
		for k := range s.cache {
			delete(s.cache, k)
			break
		}
	}
	s.cache[key] = r
	c.JSON(200, r)
}
