// Package db 는 PostGIS 연결 풀을 만든다.
package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultURL = "postgres://jeju:jeju@localhost:5433/jeju?sslmode=disable"

// Connect 는 DATABASE_URL(없으면 로컬 docker compose 기본값)로 접속한다.
func Connect(ctx context.Context) (*pgxpool.Pool, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = defaultURL
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("db 연결 설정 실패: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db 접속 실패 (docker compose up -d 했는지 확인): %w", err)
	}
	return pool, nil
}
