package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// POI measurements remain separate from H3 model scores: their spatial units differ.
type CrowdReading struct {
	Type     int     `json:"type"`
	Density  float64 `json:"congestion"`
	Level    int     `json:"congestionLevel"`
	Datetime string  `json:"datetime"`
}
type CrowdResult struct {
	PoiID     string         `json:"poiId"`
	PoiName   string         `json:"poiName"`
	Readings  []CrowdReading `json:"rltm"`
	FetchedAt time.Time      `json:"fetched_at"`
	Cached    bool           `json:"cached"`
	Source    string         `json:"source"`
	Unit      string         `json:"unit"`
}
type crowdState struct {
	Day     string                 `json:"day"`
	Calls   int                    `json:"calls"`
	Results map[string]CrowdResult `json:"results"`
}
type CrowdClient struct {
	mu                  sync.Mutex
	key, endpoint, path string
	http                *http.Client
	state               crowdState
}

func NewCrowdClient() *CrowdClient {
	key := strings.TrimSpace(os.Getenv("SKT_APP_KEY"))
	// Existing project configuration; never expose the key in a response or log.
	if key == "" {
		for _, path := range []string{".env.local", "../.env.local"} {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			for _, line := range strings.Split(string(raw), "\n") {
				name, value, ok := strings.Cut(strings.TrimSpace(line), "=")
				if ok && name == "SKT_APP_KEY" {
					key = strings.Trim(value, "\"' ")
				}
			}
			if key != "" {
				break
			}
		}
	}
	client := &CrowdClient{key: key, endpoint: "https://apis.openapi.sk.com/puzzle/place/congestion/rltm/pois/", path: "data/processed/skt_live_cache.json", http: &http.Client{Timeout: 15 * time.Second}}
	raw, _ := os.ReadFile(client.path)
	_ = json.Unmarshal(raw, &client.state)
	if client.state.Results == nil {
		client.state.Results = map[string]CrowdResult{}
	}
	return client
}

func (s *CrowdClient) save() error {
	raw, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(s.path), 0755); err != nil {
		return err
	}
	if err = os.WriteFile(s.path+".tmp", raw, 0600); err != nil {
		return err
	}
	return os.Rename(s.path+".tmp", s.path)
}

func (h *Handler) liveCongestion(c *gin.Context) {
	id := c.DefaultQuery("poiId", "2769058")
	allowed := os.Getenv("SKT_POI_IDS")
	if allowed == "" {
		allowed = "2769058"
	}
	found := false
	for _, v := range strings.Split(allowed, ",") {
		if strings.TrimSpace(v) == id {
			found = true
		}
	}
	for _, v := range id {
		if v < '0' || v > '9' {
			found = false
			break
		}
	}
	if !found || id == "" {
		c.JSON(400, gin.H{"error": "설정된 SKT_POI_IDS 장소만 조회할 수 있습니다"})
		return
	}
	s := h.Crowd
	if s == nil || s.key == "" {
		c.JSON(503, gin.H{"error": "SKT_APP_KEY 미설정"})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if r, ok := s.state.Results[id]; ok && now.Sub(r.FetchedAt) < time.Hour {
		r.Cached = true
		c.JSON(200, r)
		return
	}
	kst := time.FixedZone("KST", 9*3600)
	day := now.In(kst).Format("2006-01-02")
	if s.state.Day != day {
		s.state.Day = day
		s.state.Calls = 0
	}
	// Persistent local cap; includes failed calls. Other clients using the same key are not counted.
	limit := 10
	if n, err := strconv.Atoi(os.Getenv("SKT_DAILY_LIMIT")); err == nil && n > 0 {
		limit = n
	}
	if s.state.Calls >= limit {
		c.JSON(429, gin.H{"error": fmt.Sprintf("로컬 일일 SKT 호출 한도(%d회)에 도달했습니다", limit)})
		return
	}
	s.state.Calls++
	if err := s.save(); err != nil {
		c.JSON(503, gin.H{"error": "호출 한도 상태 저장 실패"})
		return
	}
	req, _ := http.NewRequestWithContext(c.Request.Context(), "GET", s.endpoint+id, nil)
	req.Header.Set("appKey", s.key)
	req.Header.Set("Accept", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		c.JSON(502, gin.H{"error": "SKT 연결 실패"})
		return
	}
	defer resp.Body.Close()
	var data struct {
		Status struct {
			Code string `json:"code"`
		} `json:"status"`
		Contents CrowdResult `json:"contents"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&data); err != nil || resp.StatusCode != 200 || data.Status.Code != "00" {
		c.JSON(502, gin.H{"error": "SKT 조회 실패", "upstream_status": resp.StatusCode})
		return
	}
	r := data.Contents
	if r.PoiID != id || len(r.Readings) == 0 {
		c.JSON(502, gin.H{"error": "SKT 장소 불일치 또는 데이터 없음"})
		return
	}
	for _, v := range r.Readings {
		if _, err := time.ParseInLocation("20060102150405", v.Datetime, kst); err != nil || v.Density < 0 || v.Level < 1 || v.Level > 4 {
			c.JSON(502, gin.H{"error": "SKT 응답 형식 오류"})
			return
		}
	}
	r.FetchedAt = now
	r.Source = "SKT"
	r.Unit = "명/㎡"
	// Guard against a reflected credential in upstream text.
	r.PoiName = strings.ReplaceAll(r.PoiName, s.key, "[REDACTED]")
	s.state.Results[id] = r
	if err = s.save(); err != nil {
		c.JSON(503, gin.H{"error": fmt.Sprint("혼잡도 캐시 저장 실패")})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, r)
}
