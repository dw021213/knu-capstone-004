// Package migrations 는 서버가 기동할 때 직접 실행하는 스키마를 담는다.
// (*.sql 전체는 DB 초기화 때 docker-entrypoint-initdb.d 로 실행된다. 이 .go 파일은 postgres 가 무시한다.)
package migrations

import _ "embed"

// FallRisk 는 013_fall_risk.sql. 이미 떠 있는 운영 DB 에도 자동 배포만으로 테이블이 생기게 서버 기동 시 실행한다(IF NOT EXISTS).
//
//go:embed 013_fall_risk.sql
var FallRisk string
