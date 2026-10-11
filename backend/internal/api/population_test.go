package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestPopulationCacheAndValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") != populationUA {
			t.Error("missing verified User-Agent")
		}
		if r.URL.Query().Get("api") == "GEONET.getTimeStamp" {
			w.Write([]byte("20261011184500^집계#|#"))
			return
		}
		if r.URL.Query().Get("X") != "126.732471" || r.URL.Query().Get("R") != "1450" {
			t.Error("wrong coordinate or radius")
		}
		w.Write([]byte(`[{"IN_POP":43,"OUT_POP":7,"TIME":"NOW"}]`))
	}))
	defer upstream.Close()
	client := NewPopulationClient()
	client.endpoint = upstream.URL
	client.http = upstream.Client()
	router := gin.New()
	(&Handler{Population: client}).Register(router.Group("/api"))
	query := func(q string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", "/api/population/live?"+q, nil))
		return w
	}
	valid := "lng=126.7324712&lat=33.4982282&radius=1450"
	for i := 0; i < 2; i++ {
		if w := query(valid); w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("duplicate lookup called upstream: %d", calls.Load())
	}
	for _, q := range []string{"lng=NaN&lat=33.4", "lng=126.5&lat=33.4&radius=0", "lng=127.5&lat=33.4"} {
		if query(q).Code != 400 {
			t.Fatal("invalid query accepted")
		}
	}
	client.cache = map[string]PopulationResult{}
	upstream.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`[{"TIME":"NOW"}]`)) })
	if query(valid).Code != 502 {
		t.Fatal("missing counts interpreted as zero")
	}
}
