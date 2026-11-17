// Package weather 는 AWS 관측값이 우리 기준(기상청 특보 기준 참고)을 넘었는지 판별해 위험도 가산점을 계산한다.
// 기준·가중치는 config/weather_rules.json 에 있고, 실시간과 과거 실험이 같은 코드를 쓴다.
package weather

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

// Level 은 기준 초과 정도.
type Level string

const (
	Advisory Level = "advisory" // 주의보급
	Warning  Level = "warning"  // 경보급
)

func (l Level) Label() string {
	if l == Warning {
		return "경보급"
	}
	return "주의보급"
}

type Thresholds struct {
	Advisory *float64 `json:"advisory"`
	Warning  *float64 `json:"warning"`
}

type Criterion struct {
	Metric   string      `json:"metric"`
	Op       string      `json:"op"` // ">=" | "<="
	Advisory *float64    `json:"advisory"`
	Warning  *float64    `json:"warning"`
	Mountain *Thresholds `json:"mountain,omitempty"` // 산지 지점 기준 (없으면 일반 기준)
}

type Rule struct {
	Key     string            `json:"key"`
	Label   string            `json:"label"`
	Weights map[Level]float64 `json:"weights"`
	// RateRatio 는 v4 확률 지도용 사고 배율 (단계 → 위험 유형(traffic|fall) → 배율). 없으면 1.
	// 확률 q 에 q' = 1 − (1 − q)^배율 로 곱한다 (하루 출동 건수가 배율만큼 늘 때 '1건 이상' 확률).
	RateRatio map[Level]map[string]float64 `json:"rate_ratio,omitempty"`
	Criteria  []Criterion                  `json:"criteria"`
	Evidence  map[string]any               `json:"evidence,omitempty"` // 가중치 근거 (analysis/calibration.py)
}

type Rules struct {
	Version     string  `json:"version"`
	Description string  `json:"description"`
	MaxBonus    float64 `json:"max_bonus"`
	Calibration string  `json:"calibration,omitempty"` // 가중치를 정한 방법
	Rules       []Rule  `json:"rules"`
}

// Load 는 규칙 파일을 읽고 검사한다.
func Load(path string) (*Rules, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var r Rules
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	for _, rule := range r.Rules {
		for lvl, byHazard := range rule.RateRatio {
			for hz, v := range byHazard {
				if !RRHazard(hz) || !(v > 0) || math.IsInf(v, 0) {
					return nil, fmt.Errorf("%s: %s.rate_ratio.%s.%s = %v (유형은 traffic|fall, 값은 0 보다 큰 수)", path, rule.Key, lvl, hz, v)
				}
			}
		}
		for _, c := range rule.Criteria {
			if c.Op != ">=" && c.Op != "<=" {
				return nil, fmt.Errorf("%s: %s 의 op 는 >= 또는 <=", path, rule.Key)
			}
			if !KnownMetric(c.Metric) {
				return nil, fmt.Errorf("%s: %s 의 알 수 없는 metric %q", path, rule.Key, c.Metric)
			}
		}
	}
	return &r, nil
}

// Alert 는 기준을 넘은 항목 하나.
type Alert struct {
	Key    string  `json:"key"`
	Label  string  `json:"label"`
	Level  Level   `json:"level"`
	Metric string  `json:"metric"`
	Value  float64 `json:"value"`
	Bonus  float64 `json:"bonus"`
	// RateRatio 는 이 항목의 v4 사고 배율 (traffic, fall). 1 이면 영향 없음.
	RateRatio map[string]float64 `json:"rate_ratio"`
}

// RRHazards 는 사고 배율을 매기는 위험 유형 (v4 확률 지도).
var RRHazards = []string{"traffic", "fall"}

// RRHazard 는 사고 배율 유형 이름이 맞는지.
func RRHazard(h string) bool { return h == "traffic" || h == "fall" }

// Result 는 한 지점·시각의 판별 결과.
type Result struct {
	Alerts []Alert `json:"alerts"`
	Bonus  float64 `json:"bonus"` // Σ 항목 가중치, MaxBonus 로 제한
	// RateRatio 는 v4 확률 지도에 곱할 유형별 사고 배율 = 기준 초과 항목 배율의 곱 (없으면 1).
	RateRatio map[string]float64 `json:"rate_ratio"`
}

// Evaluate 는 지표들을 규칙에 대어 기준 초과 항목과 가산점을 계산한다. 항목마다 가장 높은 단계 하나만 센다.
func (r *Rules) Evaluate(m Metrics, mountain bool) Result {
	res := Result{Alerts: []Alert{}, RateRatio: map[string]float64{}}
	for _, hz := range RRHazards {
		res.RateRatio[hz] = 1
	}
	for _, rule := range r.Rules {
		var best *Alert
		for _, c := range rule.Criteria {
			v, ok := m[c.Metric]
			if !ok || v == nil {
				continue
			}
			adv, warn := c.Advisory, c.Warning
			if mountain && c.Mountain != nil {
				adv, warn = c.Mountain.Advisory, c.Mountain.Warning
			}
			var lvl Level
			switch {
			case meets(*v, c.Op, warn):
				lvl = Warning
			case meets(*v, c.Op, adv):
				lvl = Advisory
			default:
				continue
			}
			if best == nil || (best.Level == Advisory && lvl == Warning) {
				best = &Alert{Key: rule.Key, Label: rule.Label, Level: lvl, Metric: c.Metric, Value: round1(*v), Bonus: rule.Weights[lvl]}
			}
		}
		if best != nil {
			best.RateRatio = map[string]float64{}
			for _, hz := range RRHazards {
				v, ok := rule.RateRatio[best.Level][hz]
				if !ok {
					v = 1
				}
				best.RateRatio[hz] = v
				res.RateRatio[hz] *= v
			}
			res.Alerts = append(res.Alerts, *best)
			res.Bonus += best.Bonus
		}
	}
	res.Bonus = math.Min(res.Bonus, r.MaxBonus)
	return res
}

func meets(v float64, op string, th *float64) bool {
	if th == nil {
		return false
	}
	if op == ">=" {
		return v >= *th
	}
	return v <= *th
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
