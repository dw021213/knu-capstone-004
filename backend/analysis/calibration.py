"""고립도·기상 가산 보정 곡선 (2021 교통사고 구급출동, 셀 × 일 단위).

구급출동 자료에 신고 시각(시·분)이 비어 있어 '셀-일'을 단위로 쓴다.
  - 셀의 하루 점수 = 그날 요일 조건(평일/휴일/휴일전날)의 0~23시 평균 (risk_combined)
  - 기상 = 셀에서 가장 가까운 (2021 관측 있는) AWS 지점의 그날 항목별 최고 단계

Poisson 회귀 (월 고정효과, 노출 = 셀-일 수):
  M1  log μ = 월 + b·기본점수 + Σ c_k·기상항목_k   → 기상 항목의 '점수 환산 가산' = c_k / b
  M2  log μ = 월 + b1·위해도 + b2·고립도            → 사고 빈도 기준의 고립도 상대 가중치 = b2 / (b1 + b2)

입력 (원본 구급출동 CSV 는 개인정보가 있어 레포에 넣지 않는다 — 아래는 중간 산출물):
  inc_h3.csv    순번,날짜(YYYYMMDD),h3,현장거리km,종결구분   ← 사고 좌표를 h3_cell 에 ST_Contains 로 연결
  cells.csv     h3,조건,위해도,고립도,기본점수,지점         ← risk_combined 조건별 하루 평균 + 최근접 지점
  obs_days.csv  지점,날짜,관측시간수
  eval.csv      weather-eval 출력 (기준 초과 시각만)

실행: python3 analysis/calibration.py <폴더> [out.json]
"""
import collections
import csv
import datetime as dt
import json
import math
import sys

d = sys.argv[1] if len(sys.argv) > 1 else "."
out_path = sys.argv[2] if len(sys.argv) > 2 else None
ITEMS = ["호우", "강풍", "폭염", "한파", "건조"]

# ---------- 입력 ----------
cell = {}  # (h3, 조건) → (위해도, 고립도, 점수)
stn_of = {}
for h, cond, hz, iso, sc, stn in csv.reader(open(f"{d}/cells.csv")):
    cell[(h, cond)] = (float(hz), float(iso), float(sc))
    stn_of[h] = int(stn)
cells = sorted(stn_of)

inc = collections.Counter()  # (h3, 날짜) → 건수
far = {5: collections.Counter(), 10: collections.Counter()}  # 구급차 현장거리 > N km 인 사고
dist = []  # (h3, 날짜, 현장거리)
n_all = n_road = 0
for _, day, h, km, st in csv.reader(open(f"{d}/inc_h3.csv")):
    if st != "정상":
        continue
    n_all += 1
    day = f"{day[:4]}-{day[4:6]}-{day[6:]}"
    if h in stn_of:
        n_road += 1
        inc[(h, day)] += 1
        if km:
            dist.append((h, day, float(km)))
            for t, c in far.items():
                if float(km) > t:
                    c[(h, day)] += 1

obs_ok = {(int(s), day) for s, day, n in csv.reader(open(f"{d}/obs_days.csv")) if int(n) >= 12}
alert = collections.defaultdict(dict)  # (지점, 날짜) → {항목: 1|2}
for r in csv.DictReader(open(f"{d}/eval.csv")):
    key = (int(r["stn"]), r["ts"][:10])
    for a in filter(None, r["alerts"].split("|")):
        lvl = 2 if a.endswith("경보급") else 1
        k = a.replace("주의보급", "").replace("경보급", "")
        alert[key][k] = max(alert[key].get(k, 0), lvl)


def cond_of(day):  # internal/risk/slot.go DefaultSlot 과 같게
    wd = day.weekday()
    return "holiday" if wd >= 5 else "preholiday" if wd == 4 else "weekday"


days = [dt.date(2021, 1, 1) + dt.timedelta(i) for i in range(365)]

# ---------- 셀-일 집계 ----------
# 곡선용: 변수별 분위 구간 / 회귀용: (점수 구간, 월, 기상 벡터) 그룹
units = []  # (위해도, 고립도, 점수, 월, 기상키 또는 None, 사고)
for day in days:
    ds, cond, m = day.isoformat(), cond_of(day), day.month
    for h in cells:
        hz, iso, sc = cell[(h, cond)]
        s = stn_of[h]
        wkey = None
        if (s, ds) in obs_ok:
            a = alert.get((s, ds), {})
            wkey = tuple(a.get(k, 0) for k in ITEMS)
        units.append((hz, iso, sc, m, wkey, inc.get((h, ds), 0), far[5].get((h, ds), 0), far[10].get((h, ds), 0)))


def quantile_edges(vals, n):
    v = sorted(vals)
    return [v[min(len(v) - 1, int(len(v) * i / n))] for i in range(1, n)]


def bin_of(x, edges):
    lo, hi = 0, len(edges)
    while lo < hi:
        mid = (lo + hi) // 2
        if x < edges[mid]:
            hi = mid
        else:
            lo = mid + 1
    return lo


def curve(idx, n=10, filt=None):
    """변수 idx 의 분위 구간별 사고율 (1,000 셀-일당), 95% CI (Poisson 정규근사)."""
    us = [u for u in units if filt is None or filt(u)]
    edges = quantile_edges([u[idx] for u in us], n)
    agg = [[0, 0, 0.0] for _ in range(n)]
    for u in us:
        b = agg[bin_of(u[idx], edges)]
        b[0] += 1; b[1] += u[5]; b[2] += u[idx]
    out = []
    for expo, ev, sx in agg:
        if expo == 0:
            continue
        r = ev / expo * 1000
        se = math.sqrt(max(ev, 1)) / expo * 1000
        out.append({"x": sx / expo, "rate": r, "lo": max(0, r - 1.96 * se), "hi": r + 1.96 * se, "events": ev, "exposure": expo})
    return out


# ---------- Poisson GLM (IRLS) ----------
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


def poisson(groups, names):
    """groups: [(x 벡터, 노출, 사고)] → {이름: (계수, SE)}"""
    p = len(names)
    tot_e = sum(g[2] for g in groups); tot_x = sum(g[1] for g in groups)
    beta = [0.0] * p
    beta[0] = math.log(tot_e / tot_x)
    for _ in range(50):
        XtWX = [[0.0] * p for _ in range(p)]
        XtWz = [0.0] * p
        for x, expo, ev in groups:
            eta = sum(bi * xi for bi, xi in zip(beta, x)) + math.log(expo)
            mu = math.exp(eta)
            z = eta - math.log(expo) + (ev - mu) / mu
            for i in range(p):
                if x[i] == 0:
                    continue
                wi = mu * x[i]
                XtWz[i] += wi * z
                for j in range(p):
                    if x[j]:
                        XtWX[i][j] += wi * x[j]
        new = solve(XtWX, XtWz)
        if max(abs(a - b) for a, b in zip(new, beta)) < 1e-9:
            beta = new
            break
        beta = new
    cov = inverse(XtWX)
    return {n: (beta[i], math.sqrt(cov[i][i])) for i, n in enumerate(names)}, cov


def month_x(m):
    return [1.0 if m == k else 0.0 for k in range(2, 13)]


# M1: 점수 + 기상 (관측 있는 셀-일만)
w_units = [u for u in units if u[4] is not None]
sc_edges = quantile_edges([u[2] for u in w_units], 100)
g = collections.defaultdict(lambda: [0, 0, 0.0])
for hz, iso, sc, m, wk, ev, *_ in w_units:
    k = (bin_of(sc, sc_edges), m, wk)
    g[k][0] += 1; g[k][1] += ev; g[k][2] += sc
dummies = [(it, lvl) for it in ITEMS for lvl in (1, 2)]
names1 = ["const"] + [f"m{k}" for k in range(2, 13)] + ["score"] + [f"{it}{'경보급' if l == 2 else '주의보급'}" for it, l in dummies]
groups1 = []
for (b, m, wk), (expo, ev, ssum) in g.items():
    x = [1.0] + month_x(m) + [ssum / expo] + [1.0 if wk[ITEMS.index(it)] == l else 0.0 for it, l in dummies]
    groups1.append((x, expo, ev))
# 해당 셀-일이나 사고가 하나도 없는 더미는 뺀다 (계수가 −∞ 로 발산)
keep = [i for i, n in enumerate(names1) if sum(gx[2] for gx in groups1 if gx[0][i]) > 0]
groups1 = [([x[i] for i in keep], e, v) for x, e, v in groups1]
names1 = [names1[i] for i in keep]
fit1, cov1 = poisson(groups1, names1)
b, b_se = fit1["score"]
ib = names1.index("score")
weather = []
for it, l in dummies:
    n = f"{it}{'경보급' if l == 2 else '주의보급'}"
    expo = sum(1 for u in w_units if u[4][ITEMS.index(it)] == l)
    ev = sum(u[5] for u in w_units if u[4][ITEMS.index(it)] == l)
    if n not in fit1:
        weather.append({"item": it, "level": l, "exposure": expo, "events": ev})
        continue
    c, c_se = fit1[n]
    ic = names1.index(n)
    # Δscore = c / b, 델타법 SE
    ds = c / b
    var = (c_se ** 2) / b ** 2 + (c ** 2) * (b_se ** 2) / b ** 4 - 2 * c * cov1[ic][ib] / b ** 3
    se = math.sqrt(max(var, 0))
    weather.append({"item": it, "level": l, "exposure": expo, "events": ev,
                    "rr": math.exp(c), "rr_lo": math.exp(c - 1.96 * c_se), "rr_hi": math.exp(c + 1.96 * c_se),
                    "delta_score": ds, "ds_lo": ds - 1.96 * se, "ds_hi": ds + 1.96 * se})

# M2: 위해도 + 고립도. 정답을 바꿔 가며 (전체 사고 / 현장거리 5km·10km 초과 사고)
hz_edges = quantile_edges([u[0] for u in units], 40)
iso_edges = quantile_edges([u[1] for u in units], 40)
names2 = ["const"] + [f"m{k}" for k in range(2, 13)] + ["hazard", "isolation"]
m2 = {}
for label, col in (("전체 사고", 5), ("현장거리 5km 초과", 6), ("현장거리 10km 초과", 7)):
    g2 = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for u in units:
        k = (bin_of(u[0], hz_edges), bin_of(u[1], iso_edges), u[3])
        a = g2[k]; a[0] += 1; a[1] += u[col]; a[2] += u[0]; a[3] += u[1]
    groups2 = [([1.0] + month_x(m) + [hs / e, is_ / e], e, ev) for (_, _, m), (e, ev, hs, is_) in g2.items()]
    fit2, _ = poisson(groups2, names2)
    b1, b2 = fit2["hazard"][0], fit2["isolation"][0]
    m2[label] = {"events": sum(u[col] for u in units), "b_hazard": fit2["hazard"], "b_isolation": fit2["isolation"],
                 # 두 계수가 모두 양수일 때만 '가중치'로 해석 가능
                 "implied_isolation_weight": b2 / (b1 + b2) if b1 > 0 and b2 > 0 else None}

# 고립도 ↔ 구급차 현장 거리 (사고 1건당)
iso_of_inc = []
for h, ds, km in dist:
    day = dt.date.fromisoformat(ds)
    iso_of_inc.append((cell[(h, cond_of(day))][1], km))
de = quantile_edges([x for x, _ in iso_of_inc], 10)
dagg = [[0, 0.0, 0.0, []] for _ in range(10)]
for x, km in iso_of_inc:
    a = dagg[bin_of(x, de)]; a[0] += 1; a[1] += x; a[2] += km; a[3].append(km)
dist_curve = []
for n, sx, sk, ks in dagg:
    if n:
        ks.sort()
        dist_curve.append({"x": sx / n, "mean_km": sk / n, "median_km": ks[n // 2], "share_over_10km": sum(k > 10 for k in ks) / n, "n": n})

hz_t = quantile_edges([u[0] for u in units], 3)
res = {
    "incidents_total": n_all, "incidents_on_road_cells": n_road, "cell_days": len(units), "cell_days_with_weather": len(w_units),
    "curve_score": curve(2), "curve_hazard": curve(0), "curve_isolation": curve(1),
    "curve_isolation_by_hazard": {name: curve(1, 5, f) for name, f in (
        ("위해도 하위 1/3", lambda u: u[0] < hz_t[0]),
        ("위해도 중간 1/3", lambda u: hz_t[0] <= u[0] < hz_t[1]),
        ("위해도 상위 1/3", lambda u: u[0] >= hz_t[1]))},
    "score_fit": {"b": b, "b_se": b_se, "per_0_1": math.exp(b * 0.1)},
    "weather": weather,
    "m2": m2,
    "dist_curve": dist_curve,
}
print(f"사고 {n_all}건 중 도로 셀 {n_road}건, 셀-일 {len(units)} (기상 관측 {len(w_units)})")
print(f"M1 점수 계수 b={b:.3f}±{b_se:.3f} → 점수 0.1 오르면 사고율 ×{math.exp(b * 0.1):.3f}")
for w in weather:
    if "rr" in w:
        print(f"  {w['item']}{'경보급' if w['level'] == 2 else '주의보급'}: 셀-일 {w['exposure']}, 사고 {w['events']}, "
              f"RR {w['rr']:.2f} ({w['rr_lo']:.2f}~{w['rr_hi']:.2f}) → 점수 환산 {w['delta_score']:+.3f} ({w['ds_lo']:+.3f}~{w['ds_hi']:+.3f})")
    else:
        print(f"  {w['item']}{'경보급' if w['level'] == 2 else '주의보급'}: 셀-일 {w['exposure']} (추정 불가)")
for label, r in m2.items():
    w = r["implied_isolation_weight"]
    print(f"M2 [{label} {r['events']}건] 위해도 {r['b_hazard'][0]:+.2f}±{r['b_hazard'][1]:.2f}, 고립도 {r['b_isolation'][0]:+.2f}±{r['b_isolation'][1]:.2f}"
          f" → 고립도 가중치 {f'{w:.2f}' if w is not None else '해석 불가(부호 반대)'}")
for r in dist_curve:
    print(f"  고립도 {r['x']:.2f}: 현장거리 평균 {r['mean_km']:.1f}km, 중앙 {r['median_km']:.1f}km, 10km 초과 {r['share_over_10km']:.0%} (n={r['n']})")
if out_path:
    json.dump(res, open(out_path, "w"), ensure_ascii=False, indent=1)
