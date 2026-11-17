package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

func walkTestRouter(client *WalkClient) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	client.Register(router.Group("/api"))
	return router
}

type walkTestTransport http.HandlerFunc

func (handler walkTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	response := httptest.NewRecorder()
	handler(response, req)
	return response.Result(), nil
}

func TestWalkRoutePreservesWaypointOrderAndPathBreaks(t *testing.T) {
	client := NewWalkClient("test-map", "test-rest")
	client.http.Transport = walkTestTransport(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Scheme != "https" || r.URL.Host != "dapi.kakao.com" || r.URL.Path != "/v2/routing/walk" || r.Header.Get("Authorization") != "KakaoAK test-rest" {
			t.Errorf("unexpected Kakao request: %s %s", r.Method, r.URL)
		}
		for key, want := range map[string]string{
			"start_x": "126.5", "start_y": "33.5",
			"via_x": "126.51,126.49", "via_y": "33.49,33.51",
			"end_x": "126.5", "end_y": "33.5",
		} {
			if got := r.URL.Query().Get(key); got != want {
				t.Errorf("%s = %q, want %q", key, got, want)
			}
		}
		_, _ = w.Write([]byte(`{"status":"OK","route":{
			"properties":{"totalDistance":2450,"totalTime":2100},
			"legs":[
				{"steps":[
					{"path":{"points":[[126.5,33.5],[126.51,33.49]]}},
					{"path":{"points":[[126.51,33.49],[126.52,33.49]]}}
				]},
				{"steps":[{"path":{"points":[[126.49,33.51],[126.5,33.5]]}}]}
			]
		}}`))
	})
	router := walkTestRouter(client)
	query := url.Values{
		"origin":      {"126.5,33.5"},
		"destination": {"126.5,33.5"},
		"waypoints":   {"126.51,33.49|126.49,33.51"},
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/walk/route?"+query.Encode(), nil))
	if w.Code != http.StatusOK {
		t.Fatalf("route status %d: %s", w.Code, w.Body.String())
	}
	var got struct {
		Distance int            `json:"distance_m"`
		Duration int            `json:"duration_s"`
		Paths    [][][2]float64 `json:"paths"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	wantPaths := [][][2]float64{
		{{126.5, 33.5}, {126.51, 33.49}, {126.52, 33.49}},
		{{126.49, 33.51}, {126.5, 33.5}},
	}
	if got.Distance != 2450 || got.Duration != 2100 || !reflect.DeepEqual(got.Paths, wantPaths) {
		t.Fatalf("unexpected route: %+v", got)
	}
}

func TestWalkConfigOnlyExposesPublicSettings(t *testing.T) {
	router := walkTestRouter(NewWalkClient("test-map", "test-rest"))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/walk/config", nil))
	var got map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &got)
	want := map[string]any{"map_key": "test-map", "routing_enabled": true}
	if w.Code != http.StatusOK || err != nil || !reflect.DeepEqual(got, want) {
		t.Fatal("expected successful response containing only the map key and routing flag")
	}
}

func TestWalkRejectsInvalidCoordinatesBeforeCallingKakao(t *testing.T) {
	client := NewWalkClient("", "test-rest")
	client.http.Transport = walkTestTransport(func(w http.ResponseWriter, r *http.Request) {
		t.Error("invalid coordinate reached Kakao")
		w.WriteHeader(http.StatusInternalServerError)
	})
	router := walkTestRouter(client)
	const destination = "&destination=126.5,33.51"
	for _, tc := range []struct {
		name  string
		query string
	}{
		{"non-finite", "origin=NaN,33.5" + destination},
		{"reversed", "origin=33.5,126.5" + destination},
		{"missing longitude", "origin=,33.5" + destination},
		{"missing waypoint", "origin=126.5,33.5" + destination + "&waypoints=126.49,33.51%7C"},
		{"too many waypoints", "origin=126.5,33.5" + destination + "&waypoints=126.49,33.51%7C126.49,33.52%7C126.49,33.53%7C126.49,33.54%7C126.49,33.55%7C126.49,33.56"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/walk/route?"+tc.query, nil))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestWalkRoundTripFallsBackWhenKakaoRejectsEqualEndpoints(t *testing.T) {
	client := NewWalkClient("", "test-rest")
	var queries [][3]string
	client.http.Transport = walkTestTransport(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		start, via, end := q.Get("start_x"), q.Get("via_x"), q.Get("end_x")
		queries = append(queries, [3]string{start, via, end})
		if start == end {
			_, _ = w.Write([]byte(`{"status":"SAME_POINT"}`))
			return
		}
		_, _ = fmt.Fprint(w, `{"status":"OK","route":{
			"properties":{"totalDistance":110,"totalTime":100},
			"legs":[{"steps":[{"path":{"points":[[`+start+`,33.5],[`+end+`,33.5]]}}]}]
		}}`)
	})
	router := walkTestRouter(client)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/walk/route?origin=126.5,33.5&destination=126.5,33.5&waypoints=126.51,33.5%7C126.52,33.5", nil))
	wantQueries := [][3]string{{"126.5", "126.51,126.52", "126.5"}, {"126.5", "126.51", "126.52"}, {"126.52", "", "126.5"}}
	if !reflect.DeepEqual(queries, wantQueries) {
		t.Fatalf("unexpected sequence of Kakao requests: %v", queries)
	}
	var got walkRouteResult
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || got.Distance != 220 || got.Duration != 200 || len(got.Paths) != 2 {
		t.Fatalf("unexpected round trip: %d %s", w.Code, w.Body.String())
	}
}
