#!/usr/bin/env bash
# DB 전체를 SQL 덤프(gzip)로 만든다. 팀원·운영 서버에 따로 전달 (레포에 올리지 않음).
#   scripts/db-dump.sh [--deploy] [출력 폴더]   (기본: 레포 밖 ../../ = 종프 폴더)
#   --deploy : 운영 서버용. 서비스에 안 쓰는 표는 내용을 빼고 구조만 넣는다.
#              - weather_obs(과거 기상): 서버가 켜질 때 최근 24시간을 기상청에서 다시 받음
#              - 유동인구·시간대별 종합 위험도(cell_population*, risk_combined): 2026-10-17 유동인구 제외
# 받은 쪽은 scripts/db-restore.sh(로컬) 또는 deploy/DEPLOY.md 6번(서버)으로 넣는다.
# 덤프에는 구급출동 원본·API 키가 없다(셀별 건수만).
set -euo pipefail
cd "$(dirname "$0")/.."
deploy=false
if [[ ${1:-} == --deploy ]]; then deploy=true; shift; fi
out_dir="${1:-../..}"
model=$(docker exec jeju-risk-db psql -U jeju -d jeju -Atc "SELECT dataset_id FROM hazard_meta WHERE hazard = 'traffic'" || true)
tag=nomodel
if [[ $model == *_d8_* ]]; then tag=road-d8; elif [[ $model == *islands* ]]; then tag=road-islands; elif [[ $model == *road* ]]; then tag=road; fi
extra=()
if $deploy; then tag="$tag-deploy"; extra=(--exclude-table-data=weather_obs --exclude-table-data=risk_combined --exclude-table-data=cell_population_hourly --exclude-table-data=cell_population); fi
out="$out_dir/jeju_$(date +%Y%m%d)_${tag}.sql.gz"
# --clean --if-exists: migrations 로 만들어진 빈 테이블 위에 부어도 지우고 다시 만든다
docker exec jeju-risk-db pg_dump -U jeju -d jeju --clean --if-exists --no-owner --no-privileges ${extra[@]+"${extra[@]}"} | gzip -9 > "$out"
echo "덤프: $out ($(du -h "$out" | cut -f1), 교통사고 모델 ${model:-없음})"
