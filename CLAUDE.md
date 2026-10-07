# 제주 위험도 백엔드 (Go/Gin + PostGIS + H3)

작업을 시작하기 전에 반드시 `ROADMAP.md`를 읽을 것. 결정 사항, 체크리스트, 진행 로그가 모두 거기에 있다.
단계를 끝낼 때마다 `ROADMAP.md`의 체크박스와 "진행 로그"를 갱신한다.

- 응답 언어: 한국어
- DB: `localhost:5433` (docker compose), `DATABASE_URL`은 `.env.example` 참고
- 좌표 순서 주의: h3-go는 (lat, lng), GeoJSON/PostGIS는 (lng, lat)
