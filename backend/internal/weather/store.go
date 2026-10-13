package weather

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SaveObs 는 관측을 weather_obs 에 넣는다(같은 지점·시각·출처는 덮어씀).
func SaveObs(ctx context.Context, pool *pgxpool.Pool, obs []Obs) (int, error) {
	batch := &pgx.Batch{}
	for _, o := range obs {
		batch.Queue(`INSERT INTO weather_obs (stn, ts, ta, ws, rn_1h, hm, snow, source)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (stn, ts, source) DO UPDATE
			SET ta = EXCLUDED.ta, ws = EXCLUDED.ws, rn_1h = EXCLUDED.rn_1h, hm = EXCLUDED.hm, snow = EXCLUDED.snow`,
			o.Stn, o.TS, o.TA, o.WS, o.RN1h, o.HM, o.Snow, o.Source)
	}
	if err := pool.SendBatch(ctx, batch).Close(); err != nil {
		return 0, err
	}
	return len(obs), nil
}

// JejuStations 는 weather_station 의 지점 번호 집합.
func JejuStations(ctx context.Context, pool *pgxpool.Pool) (map[int]bool, error) {
	r, err := pool.Query(ctx, `SELECT stn FROM weather_station`)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(r, pgx.RowTo[int32])
	if err != nil {
		return nil, err
	}
	out := make(map[int]bool, len(ids))
	for _, id := range ids {
		out[int(id)] = true
	}
	return out, nil
}

// StationResult 는 지점별 판별 결과.
type StationResult struct {
	Stn      int     `json:"stn"`
	Name     string  `json:"name"`
	Mountain bool    `json:"mountain"`
	Metrics  Metrics `json:"metrics"`
	Result
}

// Snapshot 은 한 시각의 전체 지점 판별 결과.
type Snapshot struct {
	At       time.Time             `json:"at"`
	Rules    string                `json:"rules_version"`
	Stations map[int]StationResult `json:"-"`
	Observed int                   `json:"stations_observed"` // 그 시각 관측이 있는 지점 수
	Sources  []string              `json:"sources"`
}

// Evaluate 는 at 시각(정시) 기준으로 모든 제주 지점을 판별한다.
// 같은 지점·시각에 출처가 여럿이면 test > apihub > kma_csv 순으로 쓴다(시연용 테스트 관측이 우선).
func EvaluateAt(ctx context.Context, pool *pgxpool.Pool, rules *Rules, at time.Time) (*Snapshot, error) {
	at = at.In(Seoul).Truncate(time.Hour)
	r, err := pool.Query(ctx, `
		SELECT DISTINCT ON (o.stn, o.ts) o.stn, o.ts, o.ta, o.ws, o.rn_1h, o.hm, o.snow, o.source
		FROM weather_obs o JOIN weather_station s USING (stn)
		WHERE o.ts BETWEEN $1 AND $2
		ORDER BY o.stn, o.ts, CASE o.source WHEN 'test' THEN 0 WHEN 'apihub' THEN 1 ELSE 2 END`,
		at.Add(-23*time.Hour), at)
	if err != nil {
		return nil, err
	}
	series := map[int][]Obs{}
	sources := map[string]bool{}
	for r.Next() {
		var o Obs
		if err := r.Scan(&o.Stn, &o.TS, &o.TA, &o.WS, &o.RN1h, &o.HM, &o.Snow, &o.Source); err != nil {
			return nil, err
		}
		series[o.Stn] = append(series[o.Stn], o)
		if o.TS.Equal(at) {
			sources[o.Source] = true
		}
	}
	if err := r.Err(); err != nil {
		return nil, err
	}

	r, err = pool.Query(ctx, `SELECT stn, name, mountain FROM weather_station`)
	if err != nil {
		return nil, err
	}
	snap := &Snapshot{At: at, Rules: rules.Version, Stations: map[int]StationResult{}, Sources: []string{}}
	for r.Next() {
		var sr StationResult
		if err := r.Scan(&sr.Stn, &sr.Name, &sr.Mountain); err != nil {
			return nil, err
		}
		sr.Metrics = ComputeMetrics(series[sr.Stn], at)
		if len(sr.Metrics) > 0 {
			snap.Observed++
		}
		sr.Result = rules.Evaluate(sr.Metrics, sr.Mountain)
		snap.Stations[sr.Stn] = sr
	}
	for s := range sources {
		snap.Sources = append(snap.Sources, s)
	}
	return snap, r.Err()
}
