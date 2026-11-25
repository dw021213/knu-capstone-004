# 제주 안전지도 프론트엔드

제주 H3 res8 격자의 교통 위험도, 시설 레이어, 코스(올레·내 코스) 구간별 위험도를 보여 주는 모바일 우선 웹앱입니다. Vite, React 19, TypeScript(strict), d3로 만듭니다.

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

e2e는 외부 서비스에 기대지 않습니다. 빌드에 가짜 카카오 키를 넣고(`playwright.config.ts`), 카카오 SDK와 OSRM 요청은 막습니다(읍면동 검색과 직선 연결로 이어짐). 카카오 검색 결과나 도로 경로가 필요한 테스트는 가짜 SDK(`fakeKakao`)와 가짜 응답을 줍니다(`tests/e2e/fixtures.ts`).

## 데이터 모드

데이터를 어디서 읽을지 빌드 시점 환경변수로 고릅니다.

| 변수             | 값                                  | 설명                                                                                                             |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `VITE_DATA_MODE` | `snapshot`(기본)                    | 배포본에 함께 실린 `public/data/*.json`을 읽습니다. 백엔드가 없어도 동작합니다. 날씨는 반영하지 않습니다         |
| `VITE_DATA_MODE` | `api`                               | `VITE_API_BASE`의 백엔드 API에서 위험도·시설·응급실을 받습니다. 코스와 데이터 버전 표기는 snapshot 파일을 씁니다 |
| `VITE_API_BASE`  | 예: `https://jeju-risk.duckdns.org` | `api` 모드에서 부를 백엔드 주소(운영). 로컬은 `http://localhost:8080`                                            |

내 코스 장소 검색에 카카오 장소 검색을 쓰려면 아래 변수를 둡니다(선택). 키는 `.env.local`에 두고 커밋하지 않습니다.

| 변수                    | 설명                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_KAKAO_MAP_JS_KEY` | 카카오 지도 JavaScript 키. 카카오 개발자 콘솔에 등록한 도메인에서만 동작합니다(지금 `localhost:8080` 등록). 없거나 막히면 읍면동 이름에서만 찾고, 검색창 아래에 그렇다고 알립니다 |

날짜 칩('오늘 / 날짜 선택')은 서울 시간대로 날짜를 셉니다. `snapshot` 모드의 점수는 날씨를 반영하지 않은 날짜 무관 공간 점수라 날짜를 바꿔도 다시 받지 않고, 칩 위에 "날씨 미반영 · 공간 점수는 날짜와 무관" 안내를 띄웁니다. `api` 모드는 고른 날짜와 지금 시각을 `at=YYYY-MM-DDTHH:00`으로 실어 `/api/grid?weather=on`을 다시 부르고, "날씨는 오늘 관측값만 반영" 안내를 띄웁니다(백엔드 기상 가산은 AWS 관측 기반이라 미래 날짜에는 들어가지 않으므로 달력에 날씨 점을 찍지 않습니다). 두 모드 값의 차이는 `docs/DATA_SOURCES.md`에 있습니다.

로컬 백엔드와 함께 쓰는 예:

```bash
VITE_DATA_MODE=api VITE_API_BASE=http://localhost:8000 npm run dev
```

## 스크립트

| 명령                     | 하는 일                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`            | 개발 서버                                                                                            |
| `npm run build`          | 타입 검사(`tsc -b`) 후 `dist/`로 빌드                                                                |
| `npm run preview`        | `dist/`를 4173 포트로 띄움                                                                           |
| `npm run typecheck`      | 타입 검사만                                                                                          |
| `npm run lint`           | ESLint                                                                                               |
| `npm run format`         | Prettier로 고침                                                                                      |
| `npm run format:check`   | Prettier 검사만                                                                                      |
| `npm run test`           | Vitest 단위 테스트                                                                                   |
| `npm run test:e2e`       | Playwright e2e(모바일 390×844, 데스크톱 1440×900). `PLAYWRIGHT_BASE_URL`을 주면 그 주소를 검사합니다 |
| `npm run data:scores`    | `data-src/risk_scores.csv`(교통 모델 전달본)로 `public/data/scores.json`을 다시 만듦                 |
| `npm run data:poi`       | 커밋된 `data-src/poi/` 원본으로 `public/data/poi/*.json`을 다시 만듦(네트워크 안 씀)                 |
| `npm run data:poi:fetch` | 시설 원본을 공공데이터포털·Nominatim에서 다시 받음. `-- --only police,er` 처럼 종류를 고를 수 있음   |

PR 전에 `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`와 `CI=1 npm run test:e2e`가 통과해야 합니다.

## 코스 화면

`/courses`에 탭 두 개(올레 코스, 내 코스)가 있고 고른 탭은 주소에 둡니다(뒤로 가기·새로고침·링크 공유가 됩니다). 두 탭과 상세 모두 위에서 오늘/내일을 고를 수 있고, 내일을 고르면 "내일 날씨는 아직 반영되지 않았어요" 안내를 띄웁니다(snapshot 모드는 뒤에 "공간 점수는 날짜와 무관"을 잇습니다).

| 주소                     | 화면                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `/courses`               | 올레 코스 목록(처음 탭). 위험 등급 낮은 순. 모르는 `?tab=` 값은 이 탭으로 봅니다 |
| `/courses?tab=mine`      | 내 코스 목록. 최근에 고친 순                                                     |
| `/courses/:id`           | 올레(`olle-N`) 코스 상세. 모르는 id는 "코스를 찾지 못했어요"와 목록 링크         |
| `/courses/mine/new`      | 내 코스 만들기                                                                   |
| `/courses/mine/:id`      | 내 코스 결과(상세와 같은 화면 + 고치기·지우기)                                   |
| `/courses/mine/:id/edit` | 내 코스 고치기                                                                   |

코스 종류마다 다른 점(탭 이름, 상세 주소, 고칠 수 있는지, 빈 목록 문구)은 `src/entities/course/kinds.ts` 표 한 곳에 있고, 두 종류 모두 같은 입력(`{ id, name, coords, lengthKm }`)으로 구간·코스 등급을 계산합니다.

내 코스는 장소를 10곳까지 고르고 위·아래 버튼으로 순서를 바꿉니다. 장소 목록은 길찾기처럼 첫 줄을 출발, 마지막 줄을 도착, 사이를 경유 1, 2…로 적고, 줄을 누르면 지도가 그 장소로 옮겨 갑니다. 장소 고르기는 카카오맵·네이버지도 검색 흐름을 따르고, 어느 조작도 사용자가 "추가"나 "코스에 추가"를 누르기 전에는 코스에 넣지 않습니다.

- 입력하면 250ms 뒤 추천 목록(최대 8줄, 읍면동 + 카카오, 맞는 부분 굵게)을 띄웁니다. 위·아래 화살표로 고르고 Esc로 닫습니다. 추천을 고르면 그 장소 카드만 띄웁니다.
- 엔터(고른 추천이 없을 때)나 검색 버튼은 시트를 검색 결과로 바꿉니다. 카카오 결과는 쪽마다 15건(최대 3쪽 45건, 카카오가 세어 주는 수도 45에서 멈춰 그때는 "45건 이상")이고 줄과 지도 표지에 같은 A~O 글자를 붙입니다. 이미 코스에 있는 장소는 "추가됨"으로 막습니다(카카오 장소끼리는 장소 번호로 가리고, 지도에서 고른 곳이나 읍면동이 끼면 20m 안을 같은 곳으로 봅니다). 한글 입력기가 조합을 확정하는 엔터(`isComposing`, keyCode 229)는 무시합니다.
- 결과 줄이나 지도 표지를 누르면 그 장소를 고릅니다. 모바일은 표지를 누르면 목록 대신 장소 카드를 띄웁니다.
- 지도를 누르면 그 자리에 임시 핀과 `{읍면동} 지점` 카드를 띄웁니다. 다른 곳을 누르면 핀이 옮겨 가고, 바로 앞 장소와 같은 곳(20m 안)은 넣지 않습니다.
- 검색 상태는 `src/features/search/searchState.ts`의 구별 유니언(idle·suggest·results·place) 하나로 둡니다.

예전 판에서 인문학 코스 장소로 만든 코스도 버리지 않고 그 장소를 지도에서 고른 장소로 읽습니다. 이 기기 `localStorage`(`jeju-safety.my-courses.v1`)에만 저장하고 로그인은 없습니다. 장소 사이 경로는 아래 순서로 잇고, 어떤 방식으로 이었는지 상세와 목록에 밝힙니다.

1. 공개 OSRM 자동차 길찾기(`router.project-osrm.org`)
2. 실패하면 백엔드 도보 길찾기(`GET {VITE_API_BASE}/api/walk/route`). `VITE_API_BASE`가 없거나 장소가 7곳을 넘으면 건너뜁니다
3. 그래도 실패하면 직선으로 잇고 "직선 연결"이라고 눈에 띄게 적습니다

방식마다 6초를 넘으면 다음으로 넘어갑니다. 카카오 JS 키는 등록 도메인에서만 동작해 로컬에서는 등록된 포트로 띄워야 카카오 검색이 됩니다(2026-11-23 확인: `localhost:8080`은 됨, `localhost:5173`은 "domain mismatched"로 막힘). 카카오 검색은 제주 범위(`bounds`)로 묻고, 그래도 섞여 온 제주 밖 결과는 버립니다.

```bash
npm run dev -- --port 8080 --strictPort
```

## Vercel 배포 설정

| 항목             | 값                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Root Directory   | `frontend`                                                                                       |
| Framework Preset | Vite                                                                                             |
| Node.js Version  | 22.x                                                                                             |
| Build Command    | `npm run build`                                                                                  |
| Output Directory | `dist`                                                                                           |
| 환경변수         | 없음(기본 `snapshot` 모드). 카카오 장소 검색은 `VITE_KAKAO_MAP_JS_KEY`와 배포 도메인 등록이 필요 |

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
