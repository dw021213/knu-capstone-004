# 백엔드 배포 (Vultr + Docker + Caddy)

구성: 서버 한 대에 `db`(PostGIS) · `server`(Go 백엔드) · `caddy`(HTTPS)를 docker compose 로 띄운다.
DB 포트는 밖으로 열지 않고, 80·443 만 연다. 데이터는 로컬에서 만든 DB 덤프로 넣는다.

## 0. 준비물
- Vultr 계정과 결제 수단
- 로컬의 **배포용** DB 덤프: `backend/scripts/db-dump.sh --deploy` → `jeju_YYYYMMDD_road-d8-deploy.sql.gz`
  (과거 기상 관측은 빠짐. 서버가 켜질 때 최근 24시간을 기상청에서 다시 받는다)
- SSH 키 (없으면 `ssh-keygen -t ed25519`)

## 1. 서버 만들기 (Vultr 콘솔)
1. Deploy → **Cloud Compute – Shared CPU** → **Regular Performance**
2. 위치 **Seoul**, 이미지 **Ubuntu 24.04 LTS x64**, 플랜 **2GB RAM**(약 $10/월)
3. **IPv4 켜 둠**(IPv6 전용으로 만들지 않는다), SSH Keys 에 내 공개키(`~/.ssh/id_ed25519.pub`) 등록
4. 백업·추가 옵션은 끈다 (요금 추가)
5. 만들어지면 서버 **IPv4 주소**를 적어 둔다

## 2. 주소(무료 서브도메인) 만들기
1. https://www.duckdns.org 에 로그인 → 서브도메인 예: `jeju-risk` → `jeju-risk.duckdns.org`
2. current ip 에 서버 IPv4 를 넣고 update
3. 확인: `dig +short jeju-risk.duckdns.org` 가 서버 IP 를 돌려줘야 한다 (HTTPS 인증서 발급 조건)

## 3. 서버 기본 설정 (SSH 접속 후)
```bash
ssh root@<서버IP>
```
```bash
apt-get update && apt-get -y upgrade
```
```bash
curl -fsSL https://get.docker.com | sh
```
```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 4. 코드 받기와 설정
```bash
git clone -b feat/backend https://github.com/dw021213/knu-capstone-004.git && cd knu-capstone-004/backend/deploy
```
```bash
cp .env.example .env && nano .env
```
`.env` 값:
| 이름 | 값 |
|---|---|
| `DOMAIN` | `jeju-risk.duckdns.org` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` 로 만든 값 |
| `CORS_ORIGINS` | 프론트 주소 (예: `https://<팀 vercel 주소>`), 여러 개면 쉼표 |
| `KMA_APIHUB_KEY` | 기상청 API허브 키 (실시간 기상 수집) |

## 5. 띄우기
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
처음엔 DB 가 migrations 로 빈 테이블을 만든다. 상태 확인:
```bash
docker compose -f docker-compose.prod.yml ps
```

## 6. 데이터 넣기 (로컬 → 서버)
로컬에서:
```bash
scp ~/Documents/대학교/종프/jeju_YYYYMMDD_road-d8-deploy.sql.gz root@<서버IP>:/root/
```
서버에서 (`backend/deploy` 폴더):
```bash
gunzip -c /root/jeju_YYYYMMDD_road-d8-deploy.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -q -v ON_ERROR_STOP=1 -U jeju -d jeju
```
```bash
docker compose -f docker-compose.prod.yml restart server
```

## 7. 확인
```bash
curl https://jeju-risk.duckdns.org/api/health
```
- 브라우저: `https://jeju-risk.duckdns.org/` (확인용 지도), `…/?at=2021-09-14T09:00` (호우 가산 예시)
- 로그: `docker compose -f docker-compose.prod.yml logs -f server` → 켜질 때 `weather: 최근 24시간 관측 …행 수집`, 이후 15분마다 `최근 3시간`

## 8. 프론트(Vercel) 연결 — 프론트 담당에게 전달
Vercel 프로젝트 → Settings → Environment Variables:
| 이름 | 값 |
|---|---|
| `VITE_DATA_MODE` | `api` |
| `VITE_API_BASE` | `https://jeju-risk.duckdns.org` |

저장 후 다시 배포(Redeploy). 백엔드 `.env` 의 `CORS_ORIGINS` 에 그 Vercel 주소가 들어 있어야 한다.

## 운영
| 할 일 | 명령 (`backend/deploy` 에서) |
|---|---|
| 코드 갱신 | `git pull && docker compose -f docker-compose.prod.yml up -d --build server` |
| 기상 규칙만 바꿈 | `config/weather_rules.json` 은 이미지에 들어 있으므로 위와 같이 다시 빌드 |
| 데이터 갱신 | 로컬에서 새 덤프 → 6번 반복 |
| 빠진 기상 시간 채우기 | `docker compose -f docker-compose.prod.yml exec server etl weather-fetch -from 2026-10-17 -to 2026-10-18` |
| 중지 | `docker compose -f docker-compose.prod.yml down` (데이터는 볼륨에 남음) |
| 완전 삭제 | `down -v` 후 Vultr 콘솔에서 서버 Destroy (시간 단위 과금이라 지우면 그때까지만 청구) |

## 주의
- `.env` 와 덤프 파일은 git 에 올리지 않는다.
- DB 포트(5432)는 열지 않는다. DB 를 직접 보려면 서버에서 `docker compose -f docker-compose.prod.yml exec db psql -U jeju -d jeju`.
- 서버를 멈춰도(Stop) Vultr 는 요금을 계속 받는다. 안 쓸 땐 Destroy.
