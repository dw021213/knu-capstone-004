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
	Key      string            `json:"key"`
	Label    string            `json:"label"`
	Weights  map[Level]float64 `json:"weights"`
	Criteria []Criterion       `json:"criteria"`
}

type Rules struct {
	Version     string  `json:"version"`
	Description string  `json:"description"`
	MaxBonus    float64 `json:"max_bonus"`
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
}

// Result 는 한 지점·시각의 판별 결과.
type Result struct {
	Alerts []Alert `json:"alerts"`
	Bonus  float64 `json:"bonus"` // Σ 항목 가중치, MaxBonus 로 제한
}

// Evaluate 는 지표들을 규칙에 대어 기준 초과 항목과 가산점을 계산한다. 항목마다 가장 높은 단계 하나만 센다.
func (r *Rules) Evaluate(m Metrics, mountain bool) Result {
	res := Result{Alerts: []Alert{}}
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
