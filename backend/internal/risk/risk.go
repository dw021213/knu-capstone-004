// Package risk 는 위험 모델 점수와 고립도를 합쳐 최종 위험도를 계산하는 규칙을 모아 둔다.
//
//	위해도   H = 가용 위험 모델(교통사고·재난·범죄) 백분위/100 의 평균
//	고립도   I = 1 − 유동인구 백분위 순위   (가장 붐빔 0, 가장 한산 1)
//	최종     S = 0.8·H + 0.2·I              (H 가 없으면 "자료 없음")
//	등급       = S 의 셀 간 백분위로 10/30/70/90 경계
//
// 고립도 가중치 기준: 고립도를 넣어도 위해도만의 상위 10% 셀 중 70% 이상이 남는 가장 큰 값.
// 교통사고 모델만 있을 때 0.2 (0.3 이면 35% 로 급락). 재난·범죄 모델이 들어오면 같은 기준으로 다시 확인한다(허용 0.15~0.25).
package risk

import "sort"

const (
	WeightHazard    = 0.8
	WeightIsolation = 0.2
	Version         = "combined_v1"
)

// Hazards 는 위해도에 들어가는 위험 모델. 가용한 것끼리 동일 가중 평균.
var Hazards = []string{"traffic", "disaster", "crime"}

// HazardLabels 는 화면 표시명.
var HazardLabels = map[string]string{
	"traffic":  "교통사고",
	"disaster": "재난",
	"crime":    "범죄",
}

// LevelBands 는 최종 백분위 → 등급 경계(이상). 지도 범례(web/index.html)도 같은 값을 쓴다.
var LevelBands = []struct {
	MinPercentile float64
	Level         int
	Label         string
}{
	{90, 5, "매우 높음"},
	{70, 4, "높음"},
	{30, 3, "보통"},
	{10, 2, "낮음"},
	{0, 1, "매우 낮음"},
}

// Level 은 최종 백분위(0~100)를 등급 1~5 로 바꾼다.
func Level(percentile float64) int {
	for _, b := range LevelBands {
		if percentile >= b.MinPercentile {
			return b.Level
		}
	}
	return 1
}

// Hazard 는 가용 위험 모델 백분위(0~100)들의 평균을 0~1 로 반환한다. 하나도 없으면 ok=false.
func Hazard(percentiles map[string]float64) (h float64, used []string, ok bool) {
	for _, hz := range Hazards {
		if p, found := percentiles[hz]; found {
			h += p / 100
			used = append(used, hz)
		}
	}
	if len(used) == 0 {
		return 0, nil, false
	}
	return h / float64(len(used)), used, true
}

// Combine 은 최종 점수 0~1 을 계산한다.
func Combine(hazard, isolation float64) float64 {
	return WeightHazard*hazard + WeightIsolation*isolation
}

// PercentRanks 는 값들의 오름차순 평균 순위 백분위 (순위−1)/(n−1) 를 0~1 로 돌려준다. 동점은 같은 값.
func PercentRanks(values []float64) []float64 {
	n := len(values)
	out := make([]float64, n)
	if n <= 1 {
		return out
	}
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return values[idx[a]] < values[idx[b]] })
	for i := 0; i < n; {
		j := i
		for j+1 < n && values[idx[j+1]] == values[idx[i]] {
			j++
		}
		avg := float64(i+j) / 2 // 0-based 평균 순위
		for k := i; k <= j; k++ {
			out[idx[k]] = avg / float64(n-1)
		}
		i = j + 1
	}
	return out
}

// Isolation 은 유동인구들로 고립도(0~1)를 계산한다. 인구가 같으면 같은 고립도.
func Isolation(populations []float64) []float64 {
	pr := PercentRanks(populations)
	for i := range pr {
		pr[i] = 1 - pr[i]
	}
	return pr
}
