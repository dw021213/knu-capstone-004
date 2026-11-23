"""ref_all.npz(v4_levels_reference.py 결과) + gh_t.csv → config/v4_levels.json 의 cuts·quantiles 갱신.

사용: python3 analysis/v4_levels_config.py <출력 폴더>
  gh_t.csv: h3,T분 (cell_facility_stat 의 fire_station + er nearest_drive_min 합)
경계 = 10·35·65·90 백분위 (행정안전부 「안전지수 운영 및 활용 지침」 제8조 등급 비율 10/25/30/25/10).
"""
import json
import sys

import numpy as np

R = sys.argv[1]
CFG = "config/v4_levels.json"
a = np.load(f"{R}/ref_all.npz", allow_pickle=True)
T, F, C, scope, h3 = (a[k] for k in ("T", "F", "C", "scope", "h3"))
T, F, C = T.astype(float), F.astype(float), C.astype(float)
full = scope == "traffic_and_fall"
tmin = dict(line.strip().split(",") for line in open(f"{R}/gh_t.csv"))
c = json.load(open(CFG))
gh = c["golden_hour"]
t = np.array([float(tmin[h]) for h in h3])
rr = gh["rr_per_10min"] ** ((np.clip(t, gh["t0_min"], gh["t1_min"]) - gh["t0_min"]) / 10)
Tg, Fg = 1 - (1 - T) ** rr, 1 - (1 - F) ** rr
Cg = np.where(full, Tg, 0) + Fg
series = {"traffic": T[0, full], "fall": F, "combined": C[:, full],  # 교통은 날짜와 무관 → 하루분
          "traffic_gh": Tg[0, full], "fall_gh": Fg, "combined_gh": Cg[:, full]}
P = [10, 35, 65, 90]
sig = lambda v: float(f"{v:.6g}")
c["cuts"] = {k: [sig(v) for v in np.percentile(x[np.isfinite(x)], P)] for k, x in series.items()}
c["quantiles"] = {k: [sig(v) for v in np.percentile(x[np.isfinite(x)], range(101))] for k, x in series.items()}
c["percentiles"] = P
c["levels"] = [{"level": 1, "label": "매우 안전", "share": 10}, {"level": 2, "label": "안전", "share": 25},
               {"level": 3, "label": "보통", "share": 30}, {"level": 4, "label": "위험", "share": 25},
               {"level": 5, "label": "매우 위험", "share": 10}]
c["version"] = "v4_levels_v3"
c["grade_basis"] = ("행정안전부 예규 「안전지수 운영 및 활용 지침」 제8조②: 1등급 10%, 2등급 25%, 3등급 30%, 4등급 25%, 5등급 10%, "
                    "1등급에 가까울수록 안전 (근거 법령 재난 및 안전관리 기본법 제66조의10). 지자체 상대평가 비율을 셀 단위 전체 기간 분포에 빌려 씀")
c["safety_score"] = "안전 점수 = 100 − (값의 전체 기간 참조 분포 백분위, quantiles 101개 사이 선형 보간). 90 이상 매우 안전 · 65~90 안전 · 35~65 보통 · 10~35 위험 · 10 미만 매우 위험"
c["cuts_note"] = "값 ≥ cuts[i] 이면 등급 i+2. [c10, c35, c65, c90] → 1 매우 안전:<c10, 2 안전:<c35, 3 보통:<c65, 4 위험:<c90, 5 매우 위험:≥c90"
c["method"] = c["method"].replace("10·30·70·90", "10·35·65·90")
json.dump(c, open(CFG, "w"), ensure_ascii=False, indent=1)
open(CFG, "a").write("\n")
for k, v in c["cuts"].items():
    print(k, v)
