package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/weather"
)

const WeatherRulesPath = "config/weather_rules.json"

func apiHub() (*weather.APIHub, error) {
	key := os.Getenv("KMA_APIHUB_KEY")
	if key == "" {
		return nil, fmt.Errorf("KMA_APIHUB_KEY 가 없음 (.env 에 기상청 API허브 인증키)")
	}
	return weather.NewAPIHub(key), nil
}

// runWeatherStations 는 API허브 AWS 지점정보에서 제주 지점을 받아 weather_station 에 넣고
// 셀마다 가장 가까운 지점을 cell_weather_station 에 연결한다.
//
//	go run ./cmd/etl weather-stations
func runWeatherStations(ctx context.Context, pool *pgxpool.Pool) error {
	hub, err := apiHub()
	if err != nil {
		return err
	}
	stations, err := hub.FetchJejuStations(ctx)
	if err != nil {
		return err
	}
	batch := &pgx.Batch{}
	batch.Queue(`TRUNCATE weather_station CASCADE`)
	mountain := 0
	for _, s := range stations {
		if s.Mountain {
			mountain++
		}
		batch.Queue(`INSERT INTO weather_station (stn, name, height_m, mountain, address, geom)
			VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326))`,
			s.Stn, s.Name, s.HeightM, s.Mountain, s.Address, s.Lon, s.Lat)
	}
	batch.Queue(`
		INSERT INTO cell_weather_station (h3_index, stn, dist_m)
		SELECT c.h3_index, n.stn, ST_Distance(c.center::geography, n.geom::geography)
		FROM h3_cell c
		CROSS JOIN LATERAL (SELECT stn, geom FROM weather_station ORDER BY geom <-> c.center LIMIT 1) n`)
	if err := sendInTx(ctx, pool, batch); err != nil {
		return err
	}
	var maxDist, avgDist float64
	if err := pool.QueryRow(ctx, `SELECT max(dist_m), avg(dist_m) FROM cell_weather_station`).Scan(&maxDist, &avgDist); err != nil {
		return err
	}
	log.Printf("weather-stations: 제주 AWS %d곳 (산지 %d), 셀→지점 평균 %.1fkm, 최대 %.1fkm",
		len(stations), mountain, avgDist/1000, maxDist/1000)
	return nil
}

// runWeatherFetch 는 API허브 정시자료를 받아 weather_obs 에 넣는다.
//
//	go run ./cmd/etl weather-fetch                                  최근 3시간 (실시간 수집)
//	go run ./cmd/etl weather-fetch -from 2021-01-01 -to 2021-12-31   기간 (과거). 이미 받은 시간은 건너뜀(이어 받기)
//	                               [-workers 4]                      동시 요청 수
func runWeatherFetch(ctx context.Context, pool *pgxpool.Pool, args []string) error {
	fs := flag.NewFlagSet("weather-fetch", flag.ExitOnError)
	from := fs.String("from", "", "시작 날짜 YYYY-MM-DD (KST)")
	to := fs.String("to", "", "끝 날짜 YYYY-MM-DD (KST, 포함)")
	workers := fs.Int("workers", 4, "동시 요청 수 (API허브 504 가 잦으면 줄이기)")
	fs.Parse(args)

	hub, err := apiHub()
	if err != nil {
		return err
	}
	stations, err := weather.JejuStations(ctx, pool)
	if err != nil {
		return err
	}
	if len(stations) == 0 {
		return fmt.Errorf("지점이 없음 (먼저 `go run ./cmd/etl weather-stations`)")
	}

	var start, end time.Time
	if *from == "" {
		end = time.Now().In(weather.Seoul).Truncate(time.Hour)
		start = end.Add(-2 * time.Hour)
	} else {
		if start, err = time.ParseInLocation(time.DateOnly, *from, weather.Seoul); err != nil {
			return err
		}
		end = start.Add(23 * time.Hour)
		if *to != "" {
			t, err := time.ParseInLocation(time.DateOnly, *to, weather.Seoul)
			if err != nil {
				return err
			}
			end = t.Add(23 * time.Hour)
		}
	}
	// 이어 받기: 기간 안에서 이미 apihub 관측이 있는 시간은 건너뛴다
	done := map[int64]bool{}
	if *from != "" {
		r, err := pool.Query(ctx, `SELECT DISTINCT ts FROM weather_obs WHERE source = 'apihub' AND ts BETWEEN $1 AND $2`, start, end)
		if err != nil {
			return err
		}
		for r.Next() {
			var ts time.Time
			if err := r.Scan(&ts); err != nil {
				return err
			}
			done[ts.Unix()] = true
		}
		if err := r.Err(); err != nil {
			return err
		}
	}
	var todo []time.Time
	for t := start; !t.After(end); t = t.Add(time.Hour) {
		if !done[t.Unix()] {
			todo = append(todo, t)
		}
	}
	log.Printf("weather-fetch: %s ~ %s 중 받을 시간 %d (이미 있음 %d), 동시 %d",
		start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"), len(todo), len(done), *workers)

	type result struct {
		t   time.Time
		n   int
		err error
	}
	jobs := make(chan time.Time)
	results := make(chan result)
	for w := 0; w < max(1, *workers); w++ {
		go func() {
			for t := range jobs {
				obs, err := hub.FetchHourly(ctx, t, stations)
				if err == nil {
					_, err = weather.SaveObs(ctx, pool, obs)
				}
				results <- result{t, len(obs), err}
			}
		}()
	}
	go func() {
		for _, t := range todo {
			jobs <- t
		}
		close(jobs)
	}()
	total, hours, failed := 0, 0, 0
	began := time.Now()
	for range todo {
		res := <-results
		if res.err != nil {
			failed++
			log.Printf("weather-fetch: %s 실패: %v", res.t.Format("2006-01-02 15:04"), res.err)
			continue
		}
		total += res.n
		hours++
		if hours%100 == 0 {
			left := time.Duration(float64(time.Since(began)) / float64(hours+failed) * float64(len(todo)-hours-failed))
			log.Printf("weather-fetch: %d/%d시간 (실패 %d), 남은 시간 약 %s", hours, len(todo), failed, left.Round(time.Minute))
		}
	}
	log.Printf("weather-fetch: %s ~ %s, %d시간 성공 (실패 %d), 관측 %d행",
		start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"), hours, failed, total)
	return nil
}

// runWeatherImport 는 기상자료개방포털에서 받은 지상(AWS·ASOS) 시간자료 CSV 들을 weather_obs(source=kma_csv)에 넣는다.
// 제주 지점(weather_station)만 넣는다.
//
//	go run ./cmd/etl weather-import "<CSV 폴더 또는 파일>"
func runWeatherImport(ctx context.Context, pool *pgxpool.Pool, path string) error {
	stations, err := weather.JejuStations(ctx, pool)
	if err != nil {
		return err
	}
	var files []string
	if st, err := os.Stat(path); err == nil && st.IsDir() {
		entries, err := os.ReadDir(path)
		if err != nil {
			return err
		}
		for _, e := range entries {
			if strings.EqualFold(filepath.Ext(e.Name()), ".csv") {
				files = append(files, filepath.Join(path, e.Name()))
			}
		}
	} else {
		files = []string{path}
	}
	sort.Strings(files)
	total, skipped := 0, 0
	var first, last time.Time
	for _, f := range files {
		obs, err := weather.ReadKMACSV(f)
		if err != nil {
			return err
		}
		var keep []weather.Obs
		for _, o := range obs {
			if !stations[o.Stn] {
				skipped++
				continue
			}
			keep = append(keep, o)
			if first.IsZero() || o.TS.Before(first) {
				first = o.TS
			}
			if o.TS.After(last) {
				last = o.TS
			}
		}
		if _, err := weather.SaveObs(ctx, pool, keep); err != nil {
			return err
		}
		total += len(keep)
		log.Printf("weather-import: %s — %d행", filepath.Base(f), len(keep))
	}
	log.Printf("weather-import: 파일 %d개, 관측 %d행 (%s ~ %s), 제주 외 지점 건너뜀 %d행",
		len(files), total, first.Format("2006-01-02 15:04"), last.Format("2006-01-02 15:04"), skipped)
	return nil
}

// runWeatherTest 는 시연·확인용 가짜 관측(source=test)을 지금 시각에 넣는다. test 관측은 실제 관측보다 우선한다.
//
//	go run ./cmd/etl weather-test heavy_rain|strong_wind|heat|cold|dry [-stn 산지|all|지점번호,…]
//	go run ./cmd/etl weather-test clear
func runWeatherTest(ctx context.Context, pool *pgxpool.Pool, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("사용법: etl weather-test <heavy_rain|strong_wind|heat|cold|dry|clear> [-stn mountain|all|지점번호,…]")
	}
	scenario := args[0]
	if scenario == "clear" {
		tag, err := pool.Exec(ctx, `DELETE FROM weather_obs WHERE source = 'test'`)
		if err != nil {
			return err
		}
		log.Printf("weather-test: 테스트 관측 %d행 삭제", tag.RowsAffected())
		return nil
	}
	fs := flag.NewFlagSet("weather-test", flag.ExitOnError)
	stnArg := fs.String("stn", "all", "mountain(산지 지점) | all | 지점번호,…")
	fs.Parse(args[1:])

	q := `SELECT stn FROM weather_station`
	switch *stnArg {
	case "all":
	case "mountain":
		q += ` WHERE mountain`
	default:
		q += ` WHERE stn = ANY(string_to_array('` + strings.ReplaceAll(*stnArg, "'", "") + `', ',')::int[])`
	}
	ids, err := queryInts(ctx, pool, q)
	if err != nil {
		return err
	}
	f := func(v float64) *float64 { return &v }
	now := time.Now().In(weather.Seoul).Truncate(time.Hour)
	var obs []weather.Obs
	for _, stn := range ids {
		for h := 0; h < 3; h++ { // 최근 3시간 (호우 3시간 누적용)
			o := weather.Obs{Stn: stn, TS: now.Add(-time.Duration(h) * time.Hour), Source: "test",
				TA: f(18), WS: f(3), RN1h: f(0), HM: f(70)}
			switch scenario {
			case "heavy_rain":
				o.RN1h = f(35) // 3시간 105mm → 경보급
			case "strong_wind":
				o.WS = f(22) // 경보급 (산지는 주의보급)
			case "heat":
				o.TA, o.HM = f(35), f(70) // 체감온도 약 37℃ → 경보급
			case "cold":
				o.TA = f(-13) // 주의보급
			case "dry":
				o.HM = f(30) // 주의보급
			default:
				return fmt.Errorf("알 수 없는 시나리오 %q", scenario)
			}
			obs = append(obs, o)
		}
	}
	if _, err := weather.SaveObs(ctx, pool, obs); err != nil {
		return err
	}
	log.Printf("weather-test: %s 시나리오 — 지점 %d곳, %s 기준 최근 3시간 관측 %d행 (지우기: etl weather-test clear)",
		scenario, len(ids), now.Format("2006-01-02 15:00"), len(obs))
	return nil
}

// runWeatherEval 은 기간 동안 시간마다 판별해 기준 초과 현황을 요약한다(과거 실험용).
//
//	go run ./cmd/etl weather-eval -from 2021-01-01 -to 2021-12-31 [-out results.csv]
func runWeatherEval(ctx context.Context, pool *pgxpool.Pool, args []string) error {
	fs := flag.NewFlagSet("weather-eval", flag.ExitOnError)
	from := fs.String("from", "", "시작 날짜 YYYY-MM-DD")
	to := fs.String("to", "", "끝 날짜 YYYY-MM-DD (포함)")
	out := fs.String("out", "", "시간·지점별 결과 CSV 경로 (선택)")
	fs.Parse(args)
	start, err := time.ParseInLocation(time.DateOnly, *from, weather.Seoul)
	if err != nil {
		return fmt.Errorf("-from: %w", err)
	}
	end := start
	if *to != "" {
		if end, err = time.ParseInLocation(time.DateOnly, *to, weather.Seoul); err != nil {
			return fmt.Errorf("-to: %w", err)
		}
	}
	end = end.Add(23 * time.Hour)
	rules, err := weather.Load(WeatherRulesPath)
	if err != nil {
		return err
	}

	var w *os.File
	if *out != "" {
		if w, err = os.Create(*out); err != nil {
			return err
		}
		defer w.Close()
		fmt.Fprintln(w, "ts,stn,name,mountain,bonus,alerts")
	}
	type key struct{ rule, level string }
	stnHours := map[key]int{}
	hoursAny := map[key]map[int64]bool{}
	hours, observedHours := 0, 0
	for t := start; !t.After(end); t = t.Add(time.Hour) {
		snap, err := weather.EvaluateAt(ctx, pool, rules, t)
		if err != nil {
			return err
		}
		hours++
		if snap.Observed > 0 {
			observedHours++
		}
		for _, sr := range snap.Stations {
			var labels []string
			for _, a := range sr.Alerts {
				k := key{a.Label, a.Level.Label()}
				stnHours[k]++
				if hoursAny[k] == nil {
					hoursAny[k] = map[int64]bool{}
				}
				hoursAny[k][t.Unix()] = true
				labels = append(labels, a.Label+a.Level.Label())
			}
			if w != nil && len(sr.Alerts) > 0 {
				fmt.Fprintf(w, "%s,%d,%s,%v,%.2f,%s\n", t.Format("2006-01-02 15:04"), sr.Stn, sr.Name, sr.Mountain, sr.Bonus, strings.Join(labels, "|"))
			}
		}
	}
	log.Printf("weather-eval: %s ~ %s, %d시간 (관측 있는 시간 %d), 규칙 %s",
		start.Format("2006-01-02"), end.Format("2006-01-02"), hours, observedHours, rules.Version)
	var keys []key
	for k := range stnHours {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].rule+keys[i].level < keys[j].rule+keys[j].level })
	for _, k := range keys {
		log.Printf("  %s %s: 한 곳 이상 초과한 시간 %d, 지점·시간 합 %d", k.rule, k.level, len(hoursAny[k]), stnHours[k])
	}
	if len(keys) == 0 {
		log.Printf("  기준을 넘은 시간 없음")
	}
	return nil
}

func queryInts(ctx context.Context, pool *pgxpool.Pool, sql string) ([]int, error) {
	r, err := pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(r, pgx.RowTo[int32])
	if err != nil {
		return nil, err
	}
	out := make([]int, len(ids))
	for i, v := range ids {
		out[i] = int(v)
	}
	return out, nil
}
