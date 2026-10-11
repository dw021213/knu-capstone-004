// server 는 위험도 지도 API 와 확인용 지도 페이지(web/)를 제공한다.
//
//	go run ./cmd/server   →  http://localhost:8080
package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"jejurisk/internal/api"
	"jejurisk/internal/db"
)

func main() {
	pool, err := db.Connect(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	r := gin.Default()
	r.Use(corsMiddleware())
	(&api.Handler{DB: pool, Crowd: api.NewCrowdClient(), Population: api.NewPopulationClient()}).Register(r.Group("/api"))
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
