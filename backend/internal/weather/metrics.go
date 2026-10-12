package weather

import (
	"math"
	"time"
)

// Obs 는 한 지점의 정시 관측. 결측은 nil.
type Obs struct {
	Stn    int
	TS     time.Time
	TA     *float64 // 기온 ℃
	WS     *float64 // 10분 평균 풍속 m/s
	RN1h   *float64 // 1시간 강수량 mm
	HM     *float64 // 상대습도 %
	Snow   *float64 // 적설 cm
	Source string
}

// Metrics 는 판별에 쓰는 지표. 값이 없으면 nil.
type Metrics map[string]*float64

var knownMetrics = map[string]string{
	"temp":         "기온 (℃)",
	"humidity":     "상대습도 (%)",
	"humidity_24h": "최근 24시간 평균 상대습도 (%, 실효습도 근사. 12시간 이상 관측 있을 때만)",
	"wind":         "10분 평균 풍속 (m/s)",
	"rain_1h":      "1시간 강수량 (mm)",
	"rain_3h":      "최근 3시간 누적 강수량 (mm)",
	"rain_12h":     "최근 12시간 누적 강수량 (mm)",
	"snow_24h":     "최근 24시간 신적설 (cm, 적설 증가량)",
	"feels_like":   "체감온도 (℃, 기상청 여름철 식)",
}

// KnownMetric 은 규칙 파일에 쓸 수 있는 지표인지.
func KnownMetric(m string) bool { _, ok := knownMetrics[m]; return ok }

// MetricLabels 는 지표 설명 (API 메타용).
func MetricLabels() map[string]string { return knownMetrics }

// ComputeMetrics 는 at 시각 기준 지표를 계산한다. series 는 같은 지점의 at−23h ~ at 관측(시각 무관 순서).
func ComputeMetrics(series []Obs, at time.Time) Metrics {
	byHour := map[int64]Obs{}
	for _, o := range series {
		byHour[o.TS.Truncate(time.Hour).Unix()] = o
	}
	cur, ok := byHour[at.Truncate(time.Hour).Unix()]
	m := Metrics{}
	if !ok {
		return m // 그 시각 관측이 없으면 판별하지 않는다
	}
	m["temp"], m["humidity"], m["wind"], m["rain_1h"] = cur.TA, cur.HM, cur.WS, cur.RN1h
	m["rain_3h"] = sumRain(byHour, at, 3)
	m["humidity_24h"] = meanHumidity(byHour, at, 24, 12)
	m["rain_12h"] = sumRain(byHour, at, 12)
	if cur.TA != nil && cur.HM != nil {
		f := FeelsLike(*cur.TA, *cur.HM)
		m["feels_like"] = &f
	}
	// 신적설 ≈ 현재 적설 − 최근 24시간 최소 적설
	if cur.Snow != nil {
		lo := *cur.Snow
		for h := 0; h < 24; h++ {
			if o, ok := byHour[at.Add(-time.Duration(h)*time.Hour).Truncate(time.Hour).Unix()]; ok && o.Snow != nil {
				lo = math.Min(lo, *o.Snow)
			}
		}
		d := math.Max(0, *cur.Snow-lo)
		m["snow_24h"] = &d
	}
	return m
}

// meanHumidity 는 최근 n시간 습도 평균. 관측이 minObs 시간 미만이면 nil.
// 건조특보의 실효습도(며칠간 가중 평균)를 대신한다 — 순간 습도는 한라산 고지대에서 너무 자주 낮게 나온다.
func meanHumidity(byHour map[int64]Obs, at time.Time, n, minObs int) *float64 {
	sum, cnt := 0.0, 0
	for h := 0; h < n; h++ {
		if o, ok := byHour[at.Add(-time.Duration(h)*time.Hour).Truncate(time.Hour).Unix()]; ok && o.HM != nil {
			sum += *o.HM
			cnt++
		}
	}
	if cnt < minObs {
		return nil
	}
	v := sum / float64(cnt)
	return &v
}

// sumRain 은 최근 n시간 1시간 강수량 합. 관측이 하나도 없으면 nil (결측 시간은 0 으로 보지 않고 건너뜀).
func sumRain(byHour map[int64]Obs, at time.Time, n int) *float64 {
	sum, any := 0.0, false
	for h := 0; h < n; h++ {
		if o, ok := byHour[at.Add(-time.Duration(h)*time.Hour).Truncate(time.Hour).Unix()]; ok && o.RN1h != nil {
			sum += *o.RN1h
			any = true
		}
	}
	if !any {
		return nil
	}
	return &sum
}

// FeelsLike 는 기상청 여름철 체감온도: Stull 습구온도 Tw 로
// −0.2442 + 0.55399·Tw + 0.45535·Ta − 0.0022·Tw² + 0.00278·Tw·Ta + 3.0
func FeelsLike(ta, rh float64) float64 {
	tw := ta*math.Atan(0.151977*math.Sqrt(rh+8.313659)) + math.Atan(ta+rh) - math.Atan(rh-1.676331) +
		0.00391838*math.Pow(rh, 1.5)*math.Atan(0.023101*rh) - 4.686035
	return -0.2442 + 0.55399*tw + 0.45535*ta - 0.0022*tw*tw + 0.00278*tw*ta + 3.0
}
