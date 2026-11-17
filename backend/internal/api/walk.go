package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	kakaoWalkEndpoint = "https://dapi.kakao.com/v2/routing/walk"
	maxWalkWaypoints  = 5
	maxWalkResponse   = 4 << 20
)

var (
	errWalkUpstream = errors.New("unexpected Kakao Walk response")
	errWalkNoRoute  = errors.New("Kakao Walk route unavailable")
	errWalkSame     = errors.New("Kakao Walk reported identical endpoints")
	errWalkQuota    = errors.New("Kakao Walk quota exceeded")
)

type WalkClient struct {
	mapKey  string
	restKey string
	http    *http.Client
}

func NewWalkClient(mapKey, restKey string) *WalkClient {
	return &WalkClient{
		mapKey:  strings.TrimSpace(mapKey),
		restKey: strings.TrimSpace(restKey),
		http: &http.Client{
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

func (w *WalkClient) Register(r gin.IRouter) {
	r.GET("/walk/config", w.config)
	r.GET("/walk/route", w.route)
}

func (w *WalkClient) config(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"map_key": w.mapKey, "routing_enabled": w.restKey != ""})
}

type walkPoint [2]float64

func (p walkPoint) valid() bool {
	return p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90
}

type walkRouteResult struct {
	Distance int           `json:"distance_m"`
	Duration int           `json:"duration_s"`
	Paths    [][]walkPoint `json:"paths"`
}

func (w *WalkClient) route(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if w.restKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "카카오맵 도보 경로 조회가 아직 설정되지 않았어요."})
		return
	}
	stops, err := parseWalkStops(c.Request.URL.RawQuery)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	result, err := w.fetchRoute(ctx, stops)
	if errors.Is(err, errWalkSame) && len(stops) > 2 && stops[0] == stops[len(stops)-1] {
		result, err = w.fetchLoop(ctx, stops)
	}
	switch {
	case err == nil:
		c.JSON(http.StatusOK, result)
	case errors.Is(err, errWalkSame), errors.Is(err, errWalkNoRoute):
		c.JSON(http.StatusNotFound, gin.H{"error": "선택한 지점을 잇는 도보 경로를 찾지 못했어요."})
	case errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "도보 경로 조회 시간이 초과됐어요. 다시 시도해 주세요."})
	case errors.Is(err, errWalkQuota):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "카카오맵 경로 조회 한도에 도달했어요. 나중에 다시 시도해 주세요."})
	default:
		c.JSON(http.StatusBadGateway, gin.H{"error": "카카오맵에서 도보 경로를 불러오지 못했어요."})
	}
}

func parseWalkStops(query string) ([]walkPoint, error) {
	values, err := url.ParseQuery(query)
	if err != nil || len(values["origin"]) != 1 || len(values["destination"]) != 1 || len(values["waypoints"]) > 1 {
		return nil, errors.New("출발지와 도착지 좌표를 하나씩 보내 주세요.")
	}

	points := []string{values.Get("origin")}
	if via := values.Get("waypoints"); via != "" {
		waypoints := strings.SplitN(via, "|", maxWalkWaypoints+1)
		if len(waypoints) > maxWalkWaypoints {
			return nil, errors.New("경유지는 최대 5개까지 추가할 수 있어요.")
		}
		points = append(points, waypoints...)
	}
	points = append(points, values.Get("destination"))

	stops := make([]walkPoint, len(points))
	for i, value := range points {
		lng, lat, ok := strings.Cut(value, ",")
		x, xErr := strconv.ParseFloat(strings.TrimSpace(lng), 64)
		y, yErr := strconv.ParseFloat(strings.TrimSpace(lat), 64)
		point := walkPoint{x, y}
		if !ok || xErr != nil || yErr != nil || !point.valid() {
			return nil, errors.New("각 지점을 유효한 경도,위도 좌표로 보내 주세요.")
		}
		stops[i] = point
	}
	return stops, nil
}

func (w *WalkClient) fetchLoop(ctx context.Context, stops []walkPoint) (walkRouteResult, error) {
	// Kakao can reject identical endpoints. Split at the final waypoint and keep the visit order.
	outbound, err := w.fetchRoute(ctx, stops[:len(stops)-1])
	if err != nil {
		return walkRouteResult{}, err
	}
	inbound, err := w.fetchRoute(ctx, stops[len(stops)-2:])
	if err != nil {
		return walkRouteResult{}, err
	}
	outbound.Distance += inbound.Distance
	outbound.Duration += inbound.Duration
	outbound.Paths = append(outbound.Paths, inbound.Paths...)
	return outbound, nil
}

type kakaoWalkResponse struct {
	Status string `json:"status"`
	Code   int    `json:"code"`
	Route  struct {
		Properties struct {
			Distance *int `json:"totalDistance"`
			Duration *int `json:"totalTime"`
		} `json:"properties"`
		Legs []struct {
			Steps []struct {
				Path struct {
					Points [][]*float64 `json:"points"`
				} `json:"path"`
			} `json:"steps"`
		} `json:"legs"`
	} `json:"route"`
}

func (w *WalkClient) fetchRoute(ctx context.Context, stops []walkPoint) (walkRouteResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, kakaoWalkEndpoint, nil)
	if err != nil {
		return walkRouteResult{}, err
	}
	values := url.Values{}
	start, end := stops[0], stops[len(stops)-1]
	values.Set("start_x", formatWalkCoordinate(start[0]))
	values.Set("start_y", formatWalkCoordinate(start[1]))
	values.Set("end_x", formatWalkCoordinate(end[0]))
	values.Set("end_y", formatWalkCoordinate(end[1]))
	if len(stops) > 2 {
		var longitudes, latitudes []string
		for _, waypoint := range stops[1 : len(stops)-1] {
			longitudes = append(longitudes, formatWalkCoordinate(waypoint[0]))
			latitudes = append(latitudes, formatWalkCoordinate(waypoint[1]))
		}
		values.Set("via_x", strings.Join(longitudes, ","))
		values.Set("via_y", strings.Join(latitudes, ","))
	}
	req.URL.RawQuery = values.Encode()
	req.Header.Set("Authorization", "KakaoAK "+w.restKey)
	req.Header.Set("Accept", "application/json")

	response, err := w.http.Do(req)
	if err != nil {
		return walkRouteResult{}, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxWalkResponse+1))
	if err != nil {
		return walkRouteResult{}, err
	}
	if len(body) > maxWalkResponse {
		return walkRouteResult{}, errWalkUpstream
	}
	var data kakaoWalkResponse
	decodeErr := json.Unmarshal(body, &data)
	if response.StatusCode == http.StatusTooManyRequests || (response.StatusCode == http.StatusBadRequest && data.Code == -10) {
		return walkRouteResult{}, errWalkQuota
	}
	if response.StatusCode != http.StatusOK || decodeErr != nil {
		return walkRouteResult{}, errWalkUpstream
	}
	return normalizeWalkRoute(data)
}

func formatWalkCoordinate(coordinate float64) string {
	return strconv.FormatFloat(coordinate, 'f', -1, 64)
}

func normalizeWalkRoute(data kakaoWalkResponse) (walkRouteResult, error) {
	switch data.Status {
	case "OK":
	case "SAME_POINT":
		return walkRouteResult{}, errWalkSame
	case "START_LINK_NOT_FOUND", "END_LINK_NOT_FOUND", "TOO_MANY_SEARCH_LINK", "TOO_FAR_AWAY", "ROUTE_RESULT_NOT_FOUND":
		return walkRouteResult{}, errWalkNoRoute
	default:
		return walkRouteResult{}, errWalkUpstream
	}

	properties := data.Route.Properties
	if properties.Distance == nil || *properties.Distance < 0 || properties.Duration == nil || *properties.Duration < 0 {
		return walkRouteResult{}, errWalkUpstream
	}
	result := walkRouteResult{Distance: *properties.Distance, Duration: *properties.Duration}
	for _, leg := range data.Route.Legs {
		for _, step := range leg.Steps {
			points := make([]walkPoint, 0, len(step.Path.Points))
			for _, point := range step.Path.Points {
				if len(point) != 2 || point[0] == nil || point[1] == nil {
					return walkRouteResult{}, errWalkUpstream
				}
				coordinates := walkPoint{*point[0], *point[1]}
				if !coordinates.valid() {
					return walkRouteResult{}, errWalkUpstream
				}
				points = append(points, coordinates)
			}
			if len(points) < 2 {
				continue
			}
			if len(result.Paths) > 0 {
				last := len(result.Paths) - 1
				current := result.Paths[last]
				if current[len(current)-1] == points[0] {
					result.Paths[last] = append(current, points[1:]...)
					continue
				}
			}
			result.Paths = append(result.Paths, points)
		}
	}
	if len(result.Paths) == 0 {
		return walkRouteResult{}, errWalkUpstream
	}
	return result, nil
}
