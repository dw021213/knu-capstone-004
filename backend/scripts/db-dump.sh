#!/usr/bin/env bash
# DB 전체를 SQL 덤프(gzip)로 만든다. 팀원에게 드라이브 등으로 전달 (레포에 올리지 않음).
#   scripts/db-dump.sh [출력 폴더]   (기본: 레포 밖 ../../ = 종프 폴더)
# 받은 쪽은 scripts/db-restore.sh 로 넣는다. 덤프에는 구급출동 원본·API 키가 없다(셀별 건수만).
set -euo pipefail
cd "$(dirname "$0")/.."
out_dir="${1:-../..}"
model=$(docker exec jeju-risk-db psql -U jeju -d jeju -Atc "SELECT dataset_id FROM hazard_meta WHERE hazard = 'traffic'" || true)
tag=nomodel
if [[ $model == *islands* ]]; then tag=road-islands; elif [[ $model == *road* ]]; then tag=road; fi
out="$out_dir/jeju_$(date +%Y%m%d)_${tag}.sql.gz"
# --clean --if-exists: migrations 로 만들어진 빈 테이블 위에 부어도 지우고 다시 만든다
docker exec jeju-risk-db pg_dump -U jeju -d jeju --clean --if-exists --no-owner --no-privileges | gzip -9 > "$out"
echo "덤프: $out ($(du -h "$out" | cut -f1), 교통사고 모델 ${model:-없음})"
