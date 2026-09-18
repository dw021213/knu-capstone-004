# 제주 안전지도 · 공공데이터 기반 위험도 산출 및 안전 분석 시각화

경북대학교 컴퓨터학부 **종합설계프로젝트1 (2026-2, 004분반)** · (주)제윤메디컬 산학협력 과제

> 여행객이 "지금 있는 곳이 얼마나 안전한지"를 **근거와 함께** 볼 수 있는 격자 기반 안전 분석 웹앱.
> 기업 서비스 위에 얹지 않고 팀이 별도 웹앱으로 개발하며, 검증된 부분은 기업이 이후 마이그레이션을 검토한다.

![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-3-1F6F78)
![H3](https://img.shields.io/badge/H3-hex_grid-1B2430)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?logo=githubactions&logoColor=white)
![Notion](https://img.shields.io/badge/Notion-docs-000000?logo=notion&logoColor=white)
![Zoom](https://img.shields.io/badge/Zoom-meetings-2D8CFF?logo=zoom&logoColor=white)

## 팀

| 역할 | 이름 |
|---|---|
| 팀장 · 기업/교수 소통 · 문서 | 김동우 |
| 팀원 | 이민환 · 서예은 · 안동균 · 배병윤 |
| 담당교수 | 권영우 교수 |
| 기업 멘토 | 이대규 책임연구원 (제윤메디컬 기술연구소 · 제주지사 제노바이츠) |

## 확정 상태 표기

- `[확정]` 멘토 QnA(9/17) 또는 수업 OT에서 명시된 사항
- `[검토 중]` 팀이 반영하려 하지만 아직 확보·검증되지 않은 사항
- `[미정]` 팀 협의 또는 멘토 확인 후 정할 사항

## 시스템 구성 (안)

```mermaid
flowchart LR
  subgraph SRC["공공데이터 소스"]
    KMA["기상청 API<br/>단기예보 · 특보"]
    TAAS["도로교통공단<br/>사고다발지역 · 이력"]
    DATA["공공데이터포털<br/>CCTV · 가로등 · 치안시설"]
    JEJU["제주데이터허브"]
    DUMP["기업 DB dump<br/>traffic_* · weather_*"]
  end
  subgraph PIPE["수집 · 격자 표준화 (Python)"]
    COL["수집 · 정제"] --> H3["H3 셀 × 시간대 집계"]
  end
  DB[("PostgreSQL 17<br/>PostGIS · H3")]
  subgraph RISK["위험도 산출"]
    V1["v1 규칙 기반 가중합"] -.-> V2["v2 학습 기반 (미정)"]
  end
  API["Go API 서버<br/>/cells · /cells/{h3} · /nearby"]
  WEB["React + TypeScript + Vite<br/>격자 등급 지도 · 클러스터 마커 · 근거 카드"]
  KMA & TAAS & DATA & JEJU & DUMP --> COL
  H3 --> DB --> RISK --> DB
  DB --> API --> WEB
```

## 기술 스택

| 구분 | 선택 | 근거 |
|---|---|---|
| 백엔드 | Go 1.23 · chi(HTTP 라우터) · pgx · h3-go | 별도 웹앱이므로 팀이 선택 `[검토 중]` |
| 프론트 | React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS | 기업 스택(React/Vite) + 현행 웹앱 관행 |
| 지도 | Kakao Maps SDK (일 10만 건 무료) · 격자 레이어 렌더러 `[미정]` | 기업 사용 중 |
| DB | PostgreSQL 17 · PostGIS · H3 | 기업 스택과 동일, dump 호환 `[확정]` |
| 협업 | GitHub(코드·회의록) · Notion(문서·일정) · KakaoTalk(멘토 소통) · Zoom(회의) | 수업 요건 + 멘토 협의 |
| 파이프라인 | Python 3.12 · Pandas · scikit-learn · h3-py | 기업 스택과 동일 |
| 인프라 | Docker Compose · GitHub Actions | 로컬 개발 → 기업 서버 테스트 `[확정]` |

## 마일스톤

| # | 마일스톤 | 기한 | 학교 일정 |
|---|---|---|---|
| M1 | 계획 및 요구분석 | 9/28 | 9/21 계획발표 · 9/28 계획서 |
| M2 | 데이터 확보 검증 | 10/2 | — |
| M3 | 시각화 초안 · 위험도 v1 | 10/16 | 멘토 요청: 10월 중순 초안 |
| M4 | 중간발표 · 중간보고서 | 11/2 | 10/19 중간발표 · 11/2 보고서 |
| M5 | 고도화 · 논문 투고 | 11/20 | — |
| M6 | 통합 · 배포 · 결과발표 | 12/7 | 12/7 결과발표 |
| M7 | 결과보고서 · 실적 제출 | 12/20 | 12/20 제출 |

기한은 [Milestones](../../milestones)에 등록되어 있다.

```mermaid
gantt
  title 과제 추진 일정 (2026-09-07 ~ 12-20)
  dateFormat  YYYY-MM-DD
  axisFormat  %m/%d
  section 공통
  M1 요구분석 · 계획서            :done, m1, 2026-09-07, 2026-09-28
  M2 데이터 확보 검증             :active, m2, 2026-09-14, 2026-10-02
  M4 중간발표 · 중간보고서         :m4, 2026-10-12, 2026-11-02
  M6 통합 테스트 · 기업 서버 배포   :m6, 2026-11-09, 2026-12-04
  section 데이터
  수집 · 정제 파이프라인 v1        :d1, 2026-09-21, 2026-10-16
  H3 격자 표준화 · PostGIS 통합 DB :d2, 2026-09-28, 2026-10-16
  section 모델
  위험도 산출 v1 (규칙 기반)       :r1, 2026-10-05, 2026-10-23
  위험도 v2 (학습 기반, 미정)      :crit, r2, 2026-10-26, 2026-11-20
  section 시각화
  M3 시각화 초안 (격자 · 클러스터 · 근거 카드) :v1, 2026-09-28, 2026-10-16
  Go API v1                       :v2, 2026-10-05, 2026-10-30
  고도화 (레이어 · 시간 뷰 · 내 주변) :v3, 2026-10-19, 2026-11-20
  section 문서
  논문 작성 · 투고 (학회 선정 후, 미정) :crit, p1, 2026-10-12, 2026-11-20
  M7 결과 보고서 · 최종 발표       :p2, 2026-11-23, 2026-12-20
  section 마일스톤
  계획발표 9/21   :milestone, 2026-09-21, 0d
  중간발표 10/19  :milestone, 2026-10-19, 0d
  결과발표 12/7   :milestone, 2026-12-07, 0d
```

## 기업 소통 이력

| 일자 | 내용 |
|---|---|
| 9/9 | 팀장 → 멘토 인사 메일 (팀 구성, 과제 이해, 질문 5개) · 당일 멘토 서면 답변 |
| 9/16 | 카카오톡 단체방 개설(팀원 5 + 멘토) · 사전 질문지 6개 항목 공유 · 9/17 Zoom 확정 |
| 9/17 | 1차 온라인 미팅(Zoom): QnA 문서 답변, 기업 사업소개·시연 영상 공유 · DB dump 요청 및 수령 |
| 9/18 | dump 링크 재수령 · 팀 내 공유 |

회의록: [docs/meetings](docs/meetings) · 데이터 출처 검증표: [docs/data/sources.md](docs/data/sources.md)

## 저장소 구조 (예정)

```
backend/    Go API 서버
frontend/   React + TypeScript + Vite
pipeline/   Python 수집 · 격자 집계 · 위험도 산출
docs/       회의록 · 데이터 명세 · 보고서
```
