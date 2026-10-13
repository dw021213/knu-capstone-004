#!/usr/bin/env bash
# 받은 덤프를 로컬 DB(jeju-risk-db)에 넣는다. 기존 데이터는 덤프 내용으로 바뀐다.
#   scripts/db-restore.sh jeju_YYYYMMDD_….sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
dump="${1:?덤프 파일 경로를 주세요 (예: scripts/db-restore.sh ~/Downloads/jeju_20261013_road-islands.sql.gz)}"
docker compose up -d --wait
gunzip -c "$dump" | docker exec -i jeju-risk-db psql -q -v ON_ERROR_STOP=1 -U jeju -d jeju >/dev/null
docker exec jeju-risk-db psql -U jeju -d jeju -Atc \
  "SELECT '격자 ' || (SELECT count(*) FROM h3_cell) || '셀, 모델 ' || COALESCE((SELECT string_agg(dataset_id, ', ') FROM hazard_meta), '없음') || ', 위험도 ' || (SELECT count(*) FROM risk_combined) || '행, 기상 관측 ' || (SELECT count(*) FROM weather_obs) || '행'"
echo "완료. 서버: go run ./cmd/server → http://localhost:8080"
