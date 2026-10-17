# 제주 안전지도 프론트엔드

제주 H3 res8 격자의 교통 위험도, 시설 레이어, 올레 코스 구간별 위험도를 보여 주는 모바일 우선 웹앱입니다. Vite, React 19, TypeScript(strict), d3로 만듭니다.

## 실행법

Node 22.13 이상이 필요합니다(`.nvmrc`는 `22`, 잠긴 vite 8·eslint 10·jsdom 29가 22.13 이상을 요구).

```bash
cd frontend
nvm use          # 선택. .nvmrc의 22를 씁니다
npm ci
npm run dev      # http://localhost:5173
```

배포 산출물을 확인하려면 `npm run build && npm run preview`(http://localhost:4173)를 씁니다.

e2e 테스트를 처음 돌릴 때는 브라우저를 한 번 내려받습니다.

```bash
npx --yes playwright install chromium
CI=1 npm run test:e2e
```

## 데이터 모드

데이터를 어디서 읽을지 빌드 시점 환경변수로 고릅니다.

| 변수             | 값                          | 설명                                                                                                     |
| ---------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_DATA_MODE` | `snapshot`(기본)            | 배포본에 함께 실린 `public/data/*.json`을 읽습니다. 백엔드가 없어도 동작합니다. 날씨는 반영하지 않습니다 |
| `VITE_DATA_MODE` | `api`                       | `VITE_API_BASE`의 백엔드 API를 부릅니다. 백엔드에 없는 시설·코스는 snapshot 파일을 씁니다                |
| `VITE_API_BASE`  | 예: `http://localhost:8000` | `api` 모드에서 부를 백엔드 주소                                                                          |

로컬 백엔드와 함께 쓰는 예:

```bash
VITE_DATA_MODE=api VITE_API_BASE=http://localhost:8000 npm run dev
```

## 스크립트

| 명령                   | 하는 일                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`          | 개발 서버                                                                                            |
| `npm run build`        | 타입 검사(`tsc -b`) 후 `dist/`로 빌드                                                                |
| `npm run preview`      | `dist/`를 4173 포트로 띄움                                                                           |
| `npm run typecheck`    | 타입 검사만                                                                                          |
| `npm run lint`         | ESLint                                                                                               |
| `npm run format`       | Prettier로 고침                                                                                      |
| `npm run format:check` | Prettier 검사만                                                                                      |
| `npm run test`         | Vitest 단위 테스트                                                                                   |
| `npm run test:e2e`     | Playwright e2e(모바일 390×844, 데스크톱 1440×900). `PLAYWRIGHT_BASE_URL`을 주면 그 주소를 검사합니다 |
| `npm run data:scores`  | `data-src/risk_scores.csv`(교통 모델 전달본)로 `public/data/scores.json`을 다시 만듦                 |

PR 전에 `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`와 `CI=1 npm run test:e2e`가 통과해야 합니다.

## Vercel 배포 설정

| 항목             | 값                         |
| ---------------- | -------------------------- |
| Root Directory   | `frontend`                 |
| Framework Preset | Vite                       |
| Node.js Version  | 22.x                       |
| Build Command    | `npm run build`            |
| Output Directory | `dist`                     |
| 환경변수         | 없음(기본 `snapshot` 모드) |

`vercel.json`은 `/data/`와 `/assets/`를 뺀 모든 경로를 `index.html`로 보내고(SPA 라우팅), `/data/*`에 `Cache-Control: public, max-age=3600`을 붙입니다.

## 지도 배경

배경 타일은 OSM 표준 타일(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)이고, 화면 오른쪽 아래에 "© OpenStreetMap contributors"를 저작권 페이지 링크와 함께 표기합니다. 공급자 주소와 출처 문구는 `src/features/map/basemap.ts` 한 곳에 있어 공급자를 바꿀 때 이 파일만 고칩니다(CARTO는 키 없이 워터마크 타일만 줘서 쓰지 않습니다).

OSM 타일 사용 정책상 대량 트래픽 서비스에는 쓰지 않습니다. 배포가 커지면 키가 있는 공급자로 바꿉니다.

## 지도 모듈

`src/features/map/`이 투영(웹 메르카토르, 기준 줌 z9), 확대·이동(d3-zoom, z9~16, 제주 경계 안), 배경 타일, 셀 canvas 그리기, 셀 찾기를 맡습니다. 이 폴더 밖에서는 투영을 직접 쓰지 않습니다.

e2e 테스트는 아래 읽기 전용 창구를 씁니다.

| 이름                                 | 뜻                                                        |
| ------------------------------------ | --------------------------------------------------------- |
| `window.__mapReady`                  | 셀을 처음 그린 뒤 `true`                                  |
| `window.__mapDebug.project(lng,lat)` | 위경도의 화면(뷰포트) 좌표 `[x, y]`                       |
| `window.__mapDebug.zoom()`           | 지금 줌 단계(소수)                                        |
| `performance` mark `cells-drawn`     | 셀을 그릴 때마다 남김. 첫 항목이 첫 화면 그리기 완료 시각 |
