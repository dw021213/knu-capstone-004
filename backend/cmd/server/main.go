// server 는 위험도 지도 API 와 확인용 지도 페이지(web/)를 제공한다.
//
//	go run ./cmd/server   →  http://localhost:8080
package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/api"
	"jejurisk/internal/db"
	"jejurisk/internal/envfile"
	"jejurisk/internal/weather"
)

func main() {
	envfile.Load(".env")
	pool, err := db.Connect(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	r := gin.Default()
	r.Use(corsMiddleware())
	(&api.Handler{DB: pool, WeatherRulesPath: "config/weather_rules.json"}).Register(r.Group("/api"))
	startWeatherPoller(pool)
	// 확인용 지도 페이지. 코드가 자주 바뀌어서 브라우저가 옛 페이지를 캐시로 쓰지 않게 한다.
	r.GET("/", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File("web/index.html")
	})

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

// corsMiddleware 는 다른 주소에서 도는 프론트(D3 등)가 API 를 호출할 수 있게 한다.
// CORS_ORIGINS="http://localhost:5173,https://team.example.com" 처럼 지정하고, 없으면 개발용으로 모두 허용.
func corsMiddleware() gin.HandlerFunc {
	cfg := cors.Config{AllowMethods: []string{"GET", "HEAD", "OPTIONS"}}
	if v := strings.TrimSpace(os.Getenv("CORS_ORIGINS")); v != "" {
		for _, o := range strings.Split(v, ",") {
			cfg.AllowOrigins = append(cfg.AllowOrigins, strings.TrimSpace(o))
		}
	} else {
		cfg.AllowAllOrigins = true
	}
	return cors.New(cfg)
}

// startWeatherPoller 는 KMA_APIHUB_KEY 가 있으면 15분마다 최근 3시간 AWS 정시자료를 받아 weather_obs 에 넣는다.
// WEATHER_POLL=off 로 끌 수 있다.
func startWeatherPoller(pool *pgxpool.Pool) {
	key := os.Getenv("KMA_APIHUB_KEY")
	if key == "" || os.Getenv("WEATHER_POLL") == "off" {
		log.Printf("weather: 실시간 수집 꺼짐 (KMA_APIHUB_KEY 없음 또는 WEATHER_POLL=off)")
		return
	}
	hub := weather.NewAPIHub(key)
	poll := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		stations, err := weather.JejuStations(ctx, pool)
		if err != nil || len(stations) == 0 {
			log.Printf("weather: 지점 없음 (etl weather-stations 필요): %v", err)
			return
		}
		now := time.Now().In(weather.Seoul).Truncate(time.Hour)
		n := 0
		for t := now.Add(-2 * time.Hour); !t.After(now); t = t.Add(time.Hour) {
			obs, err := hub.FetchHourly(ctx, t, stations)
			if err != nil {
				log.Printf("weather: %s 수집 실패: %v", t.Format("01-02 15:04"), err)
				continue
			}
			if _, err := weather.SaveObs(ctx, pool, obs); err != nil {
				log.Printf("weather: 저장 실패: %v", err)
				return
			}
			n += len(obs)
		}
		log.Printf("weather: 최근 3시간 관측 %d행 수집 (~%s)", n, now.Format("01-02 15:04"))
	}
	go func() {
		poll()
		for range time.Tick(15 * time.Minute) {
			poll()
		}
	}()
}
