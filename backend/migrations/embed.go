// Package migrations 는 서버가 기동할 때 직접 실행하는 스키마를 담는다.
// (*.sql 전체는 DB 초기화 때 docker-entrypoint-initdb.d 로 실행된다. 이 .go 파일은 postgres 가 무시한다.)
package migrations

import _ "embed"

// FallRisk 는 013_fall_risk.sql. 이미 떠 있는 운영 DB 에도 자동 배포만으로 테이블이 생기게 서버 기동 시 실행한다(IF NOT EXISTS).
//
//go:embed 013_fall_risk.sql
var FallRisk string

// DriveTimeOSRM 은 014_drive_time_osrm.sql. cell_facility_stat 에 도로 거리·최근접 시설 이름·계산 방식 열을 더한다(IF NOT EXISTS).
//
//go:embed 014_drive_time_osrm.sql
var DriveTimeOSRM string
