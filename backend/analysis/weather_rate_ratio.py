"""기상 기준 초과일의 교통사고 구급출동 배율 (Mantel-Haenszel, 지점 × 월 층화).

입력 (원본 구급출동 CSV 는 개인정보가 있어 레포에 넣지 않는다 — 아래 3개 파일은 중간 산출물):
  obs_days.csv     지점,날짜,관측시간수        ← weather_obs(source=kma_csv) 집계
  incidents.csv    출동번호,날짜,지점          ← 사고 좌표를 2021 관측이 있는 가장 가까운 AWS 지점에 연결
  eval.csv         ts,stn,name,mountain,bonus,alerts  ← go run ./cmd/etl weather-eval -from 2021-01-01 -to 2021-12-31 -out eval.csv

실행: python3 analysis/weather_rate_ratio.py <폴더>
"""
import collections
import csv
import math
import sys

d = sys.argv[1] if len(sys.argv) > 1 else "."
obs = {(int(s), day) for s, day, n in csv.reader(open(f"{d}/obs_days.csv")) if int(n) >= 12}
acc = collections.Counter((int(s), day) for _, day, s in csv.reader(open(f"{d}/incidents.csv")))
alert = collections.defaultdict(dict)  # (지점, 날짜) → {항목: 1 주의보급 | 2 경보급} (그날 최고 단계)
for r in csv.DictReader(open(f"{d}/eval.csv")):
    key = (int(r["stn"]), r["ts"][:10])
    for a in r["alerts"].split("|"):
        lvl = 2 if a.endswith("경보급") else 1
        k = a.replace("주의보급", "").replace("경보급", "")
        alert[key][k] = max(alert[key].get(k, 0), lvl)

print(f"분석 사고 {sum(v for k, v in acc.items() if k in obs)}건, 지점·일 {len(obs)}")
print(f"{'항목':<4}{'단계':<7}{'초과 지점·일':>10}{'초과일 사고':>9}{'MH배율':>8}{'95%CI':>14}")
for rule in ["호우", "강풍", "폭염", "한파", "건조"]:
    for min_lvl, name in ((1, "주의보급+"), (2, "경보급")):
        strata = collections.defaultdict(lambda: [0, 0, 0, 0])  # 초과일 사고, 초과일 수, 평상일 사고, 평상일 수
        for stn, day in obs:
            s = strata[(stn, day[:7])]
            e = acc.get((stn, day), 0)
            if alert.get((stn, day), {}).get(rule, 0) >= min_lvl:
                s[0] += e; s[1] += 1
            else:
                s[2] += e; s[3] += 1
        t1 = sum(s[1] for s in strata.values())
        if t1 == 0:
            continue
        num = den = var = 0.0
        for a, n1, b, n0 in strata.values():
            n = n1 + n0
            if n1 and n0:
                num += a * n0 / n; den += b * n1 / n; var += n1 * n0 * (a + b) / n / n
        mh = num / den if den else float("nan")
        ci = ""
        if num > 0 and den > 0:
            se = math.sqrt(var / (num * den))
            ci = f"{mh * math.exp(-1.96 * se):.2f}~{mh * math.exp(1.96 * se):.2f}"
        print(f"{rule:<4}{name:<7}{t1:>10}{sum(s[0] for s in strata.values()):>9}{mh:>8.2f}{ci:>14}")
