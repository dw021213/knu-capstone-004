"""인근 시설(개수·거리)이 교통사고 구급출동에 주는 영향 (셀 단위, 2021).

시설은 날마다 바뀌지 않으므로 셀 × 1년을 단위로 본다 (셀-일로 쪼개도 계수는 같다).
  log μ = a + b·모델점수 + c·시설지표      (모델점수 = 깊이8 위험점수 0~1)
  → '점수 환산 가산' = c·Δ / b  (Δ = 비교 단위: 1 표준편차 또는 '있음 vs 없음')

셀마다 사고 수의 흩어짐이 Poisson 보다 커서(과산포) 표준오차를 피어슨 χ²/자유도로 키운다(준-Poisson).

입력 cells.csv (셀 단위 집계만 — 원본 구급출동 행은 없음):
  h3_index,score,n,ped,fac
  fac = "종류:셀안개수:인접1링개수:최근접거리m:최근접주행분|…"  ← cell_facility_stat
  n   = 2021 교통사고 구급출동(종결 '정상') 중 그 셀 안 건수, ped = 그중 보행자

실행: python3 analysis/facility_effect.py <cells.csv> [n|ped]
"""
import csv
import math
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "cells.csv"
target = sys.argv[2] if len(sys.argv) > 2 else "n"

rows = []
for r in csv.DictReader(open(path)):
    fac = {}
    for part in r["fac"].split("|"):
        t, cin, k1, dist, drive = part.split(":")
        fac[t] = (int(cin), int(k1), float(dist), float(drive))
    rows.append((float(r["score"]), int(r[target]), fac))


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c and M[r][c]:
                f = M[r][c] / M[c][c]
                for k in range(c, n + 1):
                    M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def inverse(A):
    n = len(A)
    return [list(col) for col in zip(*[solve(A, [1.0 if i == j else 0.0 for i in range(n)]) for j in range(n)])]


def poisson(X, y):
    """X: [[1, x1, …]], y: [건수] → (계수, 준-Poisson 표준오차, 과산포 φ)"""
    p = len(X[0])
    beta = [math.log(sum(y) / len(y))] + [0.0] * (p - 1)
    for _ in range(100):
        A = [[0.0] * p for _ in range(p)]
        g = [0.0] * p
        for x, ev in zip(X, y):
            mu = math.exp(sum(b * v for b, v in zip(beta, x)))
            for i in range(p):
                g[i] += (ev - mu) * x[i]
                for j in range(p):
                    A[i][j] += mu * x[i] * x[j]
        step = solve(A, g)
        beta = [b + s for b, s in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-10:
            break
    mus = [math.exp(sum(b * v for b, v in zip(beta, x))) for x in X]
    phi = sum((ev - mu) ** 2 / mu for ev, mu in zip(y, mus)) / (len(y) - p)
    cov = inverse(A)
    return beta, [math.sqrt(cov[i][i] * phi) for i in range(p)], phi


def sd(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))


y = [r[1] for r in rows]
score = [r[0] for r in rows]
base, base_se, phi0 = poisson([[1, s] for s in score], y)
b = base[1]
print(f"셀 {len(rows)}개 (도로 있는 셀), 사고 {sum(y)}건 [{target}], 과산포 φ={phi0:.1f}")
print(f"모델 점수만: b={b:.3f} → 점수 0.1 당 ×{math.exp(b * 0.1):.2f}\n")

# 지표: (이름, 값 함수, 비교 단위 설명, Δ)
FEATS = []
for t, ko in [("cctv", "CCTV"), ("convenience", "편의점"), ("lodging", "숙박"), ("police", "경찰서")]:
    FEATS.append((f"{ko} 개수(인접 포함)", lambda f, t=t: math.log1p(f[t][1]), "1SD", None))
    FEATS.append((f"{ko} 있음(인접 포함)", lambda f, t=t: 1.0 if f[t][1] > 0 else 0.0, "있음", 1.0))
for t, ko in [("cctv", "CCTV"), ("convenience", "편의점"), ("police", "경찰서"), ("fire_station", "119"), ("er", "응급실")]:
    FEATS.append((f"{ko} 거리(log km)", lambda f, t=t: math.log(max(f[t][2], 100) / 1000), "1SD", None))
FEATS.append(("119 주행시간(분)", lambda f: f["fire_station"][3], "1SD", None))
FEATS.append(("응급실 주행시간(분)", lambda f: f["er"][3], "1SD", None))

print(f"{'지표':<22}{'비교':>5}{'배수':>7}{'95%CI':>13}{'점수환산':>9}  판정")
for name, fn, unit, delta in FEATS:
    x = [fn(r[2]) for r in rows]
    if len(set(x)) < 2:
        continue
    d = delta if delta is not None else sd(x)
    beta, se, _ = poisson([[1, s, v] for s, v in zip(score, x)], y)
    c, cse = beta[2] * d, se[2] * d
    lo, hi = math.exp(c - 1.96 * cse), math.exp(c + 1.96 * cse)
    sig = "유의" if lo > 1 or hi < 1 else "-"
    print(f"{name:<22}{unit:>5}{math.exp(c):>7.2f}{f'{lo:.2f}~{hi:.2f}':>13}{c / beta[1]:>+9.3f}  {sig}")

# 한꺼번에 (서로 겹치는 정도를 보려고)
names = ["CCTV 개수", "편의점 개수", "숙박 개수", "경찰서 있음", "119 거리", "응급실 거리"]
fns = [lambda f: math.log1p(f["cctv"][1]), lambda f: math.log1p(f["convenience"][1]),
       lambda f: math.log1p(f["lodging"][1]), lambda f: 1.0 if f["police"][1] > 0 else 0.0,
       lambda f: math.log(max(f["fire_station"][2], 100) / 1000), lambda f: math.log(max(f["er"][2], 100) / 1000)]
cols = [[fn(r[2]) for r in rows] for fn in fns]
sds = [1.0 if n == "경찰서 있음" else sd(c) for n, c in zip(names, cols)]
beta, se, phi = poisson([[1, s] + [c[i] for c in cols] for i, s in enumerate(score)], y)
print(f"\n함께 넣은 모형 (모델 b={beta[1]:.3f}, φ={phi:.1f})")
for k, (n, d) in enumerate(zip(names, sds), start=2):
    c, cse = beta[k] * d, se[k] * d
    lo, hi = math.exp(c - 1.96 * cse), math.exp(c + 1.96 * cse)
    print(f"  {n:<10} ×{math.exp(c):.2f} ({lo:.2f}~{hi:.2f}) 점수환산 {c / beta[1]:+.3f}{'  유의' if lo > 1 or hi < 1 else ''}")
