package geo

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Geocoder 는 주소 문자열을 좌표로 바꾼다. 카카오 키가 생기면 구현체만 교체한다.
type Geocoder interface {
	Geocode(ctx context.Context, query string) (lat, lng float64, ok bool, err error)
}

// Nominatim 은 OSM Nominatim 지오코더. 이용 정책상 초당 1건, User-Agent 필수.
type Nominatim struct {
	Client    *http.Client
	UserAgent string
	last      time.Time
}

func NewNominatim() *Nominatim {
	return &Nominatim{
		Client:    &http.Client{Timeout: 15 * time.Second},
		UserAgent: "jeju-risk-capstone/0.1 (university capstone project)",
	}
}

func (n *Nominatim) Geocode(ctx context.Context, query string) (float64, float64, bool, error) {
	if wait := time.Until(n.last.Add(1100 * time.Millisecond)); wait > 0 {
		time.Sleep(wait)
	}
	n.last = time.Now()

	q := url.Values{}
	q.Set("q", query)
	q.Set("format", "jsonv2")
	q.Set("countrycodes", "kr")
	q.Set("limit", "1")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://nominatim.openstreetmap.org/search?"+q.Encode(), nil)
	if err != nil {
		return 0, 0, false, err
	}
	req.Header.Set("User-Agent", n.UserAgent)
	req.Header.Set("Accept-Language", "ko")

	resp, err := n.Client.Do(req)
	if err != nil {
		return 0, 0, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, false, fmt.Errorf("nominatim HTTP %d", resp.StatusCode)
	}
	var rows []struct {
		Lat      string `json:"lat"`
		Lon      string `json:"lon"`
		Category string `json:"category"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return 0, 0, false, err
	}
	// 도로(highway)로만 매칭되면 도로 전체의 대표점이라 수 km 틀릴 수 있다(예: 일주서로). 실패로 처리.
	if len(rows) == 0 || rows[0].Category == "highway" {
		return 0, 0, false, nil
	}
	lat, err1 := strconv.ParseFloat(rows[0].Lat, 64)
	lng, err2 := strconv.ParseFloat(rows[0].Lon, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false, fmt.Errorf("좌표 파싱 실패: %q,%q", rows[0].Lat, rows[0].Lon)
	}
	return lat, lng, true, nil
}

var parenRe = regexp.MustCompile(`\s*\(.*?\)`)

// NormalizeAddress 는 "제주 제주시 탑동로 101(삼도2동)" → "제주특별자치도 제주시 탑동로 101".
func NormalizeAddress(addr string) string {
	a := strings.TrimSpace(parenRe.ReplaceAllString(addr, ""))
	if strings.HasPrefix(a, "제주 ") {
		a = "제주특별자치도 " + strings.TrimPrefix(a, "제주 ")
	}
	return a
}

// InJeju 는 좌표가 제주도 대략 범위(추자도 제외) 안인지 확인한다.
func InJeju(lat, lng float64) bool {
	return lat > 33.1 && lat < 33.6 && lng > 126.1 && lng < 127.0
}
