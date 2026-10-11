# 제주 위험도 백엔드 (Go/Gin + PostGIS + H3)

작업을 시작하기 전에 반드시 `ROADMAP.md`를 읽을 것. 결정 사항, 체크리스트, 진행 로그가 모두 거기에 있다.
단계를 끝낼 때마다 `ROADMAP.md`의 체크박스와 "진행 로그"를 갱신한다.

- 응답 언어: 한국어
- 위치: 팀 레포 `knu-capstone-004` 의 `backend/`, 작업 브랜치 `feat/backend`. main 에 직접 push 하지 않는다
- 커밋 이메일: `107867881+MinhwanO@users.noreply.github.com` (레포 로컬 git config 에 설정됨)
- DB: `localhost:5433` (docker compose, 프로젝트 이름 `jeju-risk`), `DATABASE_URL`은 `.env.example` 참고
- 좌표 순서 주의: h3-go는 (lat, lng), GeoJSON/PostGIS는 (lng, lat)
