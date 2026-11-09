#!/usr/bin/env bash
# 제주 도로망 OSRM 을 로컬에 띄운다 (etl drive-time 계산용, 서버에는 필요 없음).
# 필요: docker, osmium-tool(brew install osmium-tool). 작업 폴더 기본 ~/osrm (약 300MB).
#   scripts/osrm-jeju.sh          # 내려받기(없을 때만) → 자르기 → 전처리 → 127.0.0.1:5000 에 띄움
#   go run ./cmd/etl drive-time   # → data/processed/drive_time_osrm.csv + 로컬 DB
#   docker rm -f osrm-jeju        # 다 쓰면 끄기
set -euo pipefail
DIR="${OSRM_DIR:-$HOME/osrm}"
IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
mkdir -p "$DIR" && cd "$DIR"
[ -f south-korea-latest.osm.pbf ] || curl -fLo south-korea-latest.osm.pbf https://download.geofabrik.de/asia/south-korea-latest.osm.pbf
# 제주 본섬 + 우도·추자도·가파도·마라도
osmium extract -b 126.1,33.0,127.0,34.05 south-korea-latest.osm.pbf -o jeju.osm.pbf --overwrite
docker run --rm -v "$DIR:/data" $IMG osrm-extract -p /opt/car.lua /data/jeju.osm.pbf
docker run --rm -v "$DIR:/data" $IMG osrm-partition /data/jeju.osrm
docker run --rm -v "$DIR:/data" $IMG osrm-customize /data/jeju.osrm
docker rm -f osrm-jeju 2>/dev/null || true
docker run -d --name osrm-jeju -p 127.0.0.1:5000:5000 -v "$DIR:/data" $IMG \
  osrm-routed --algorithm mld --max-table-size 10000 /data/jeju.osrm
echo "OSRM: http://127.0.0.1:5000 (OSM 자료 $(date -r south-korea-latest.osm.pbf +%F) 기준)"
