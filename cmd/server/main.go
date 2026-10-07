// server 는 위험도 지도 API 와 확인용 지도 페이지(web/)를 제공한다.
//
//	go run ./cmd/server   →  http://localhost:8080
package main

import (
	"context"
	"log"
	"os"

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
	(&api.Handler{DB: pool}).Register(r.Group("/api"))
	r.StaticFile("/", "web/index.html")

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}
