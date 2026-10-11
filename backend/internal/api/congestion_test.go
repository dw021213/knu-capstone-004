package api

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestLiveCacheAndQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("SKT_POI_IDS", "2769058")
	t.Setenv("SKT_DAILY_LIMIT", "10")
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("appKey") != "secret" {
			t.Error("missing authentication")
		}
		_, _ = w.Write([]byte(`{"status":{"code":"00"},"contents":{"poiId":"2769058","poiName":"제주","rltm":[{"type":1,"congestion":0.0123,"congestionLevel":1,"datetime":"20261011165000"}]}}`))
	}))
	defer upstream.Close()
	client := &CrowdClient{key: "secret", endpoint: upstream.URL + "/", path: filepath.Join(t.TempDir(), "cache.json"), http: upstream.Client(), state: crowdState{Results: map[string]CrowdResult{}}}
	router := gin.New()
	(&Handler{Crowd: client}).Register(router.Group("/api"))
	query := func(id string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", "/api/congestion/live?poiId="+id, nil))
		return w
	}
	if w := query("2769058"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := query("2769058"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if calls != 1 {
		t.Fatalf("cache made %d upstream calls", calls)
	}
	if query("999").Code != 400 || calls != 1 {
		t.Fatal("unconfigured POI reached upstream")
	}
	raw, err := os.ReadFile(client.path)
	if err != nil {
		t.Fatal(err)
	}
	var restored crowdState
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.Calls != 1 || len(restored.Results) != 1 {
		t.Fatal("cache/quota not persisted")
	}
	client.state = restored
	if query("2769058").Code != 200 || calls != 1 {
		t.Fatal("restored cache reached upstream")
	}
	client.state.Results = map[string]CrowdResult{}
	client.state.Calls = 10
	if query("2769058").Code != 429 || calls != 1 {
		t.Fatal("quota did not block request")
	}
}
