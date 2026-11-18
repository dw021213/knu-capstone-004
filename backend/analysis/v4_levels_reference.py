"""v4 등급 고정 경계(config/v4_levels.json)용 참조 분포 만들기.

사용: python -I analysis/v4_levels_reference.py <jeju-risk-backend-v4 폴더> <출력 폴더> <공휴일 CSV(2013~2026)>
  - 2013-01-30~2026-11-04 모든 날짜에 v4 예측(기상 반영 전)을 돌려 <출력>/ref_all.npz 저장 (약 3분)
  - 공휴일 CSV: python-holidays KR 2013~2025 + 패키지 holidays_2026.csv, known_by 는 전년 06-30
  - 경계 = 전체 셀·날짜 값의 10·30·70·90 백분위 (combined 는 traffic_and_fall 셀만)
"""
import sys,time
import numpy as np,pandas as pd
sys.path.insert(0,sys.argv[1])
import risk_runtime as rr, additive_runtime as ar
from risk_runtime import read_json,PACKAGE,grid,align,numeric_matrix,calendar_features,arrival_features
from pathlib import Path
HOL=sys.argv[3]
# 과거 날짜 참조 분포용: 공간 입력(2026) 연도 검사만 건너뜀. 나머지 입력·모델·보정은 그대로.
def build(target,spatial_path,arrivals_path,holiday_path,strict=False):
    config=read_json(PACKAGE/'config/fall.json');cells=grid().h3.to_numpy()
    frame=align(pd.read_csv(spatial_path,dtype={'h3':str}),cells)
    cal=calendar_features(HOL,target);arr,quality=arrival_features(arrivals_path,target,strict)
    for n,v in zip(config['calendar_feature_names'],cal):frame[n]=v
    for n,v in zip(config['arrival_feature_names'],arr):frame[n]=v
    return frame,numeric_matrix(frame,config['feature_order']),quality,read_json(Path(spatial_path).with_suffix('.json'))
rr.build_fall_inputs=build
dates=pd.date_range('2013-01-30','2026-11-04')
T=[];F=[];C=[];Q=[];ok=[];t0=time.time()
for d in dates:
    ds=d.strftime('%Y-%m-%d')
    try: rows,meta=ar.predict_risks(ds)
    except Exception as e: print(ds,'ERR',e,flush=True); continue
    T.append(rows.traffic_probability.to_numpy(np.float32)); F.append(rows.fall_probability.to_numpy(np.float32))
    C.append(rows.combined_risk_index.to_numpy(np.float32)); Q.append(meta['data_quality']); ok.append(ds)
np.savez_compressed(sys.argv[2]+'/ref_all.npz',dates=np.array(ok),T=np.array(T),F=np.array(F),C=np.array(C),Q=np.array(Q),h3=rows.h3.to_numpy(),scope=rows.index_scope.to_numpy())
print('done',len(ok),'of',len(dates),round(time.time()-t0,1),'s')
