package geo

import "math"

// 구급출동이 많은 셀은 위험도를 올린다 (테스트 규칙).
//
//	강도 e = log(1+건수) / log(1+기준건수), 0~1 로 자름. 기준건수 = 출동 있는 셀들의 99 백분위.
//	점수 = 점수 + 0.4·e·(1 − 점수)   (남은 여유의 최대 40% 만큼 올림, 1 을 넘지 않음)
//
// 건수는 도심에 몰려 있어 로그를 씌워 외곽의 몇 건도 반영되게 한다.
const (
	EMSBoost      = 0.4
	EMSPercentile = 0.99
)

// EMSIntensity 는 셀 출동 건수를 0~1 강도로 바꾼다.
func EMSIntensity(count, ref float64) float64 {
	if count <= 0 || ref <= 0 {
		return 0
	}
	return math.Min(1, math.Log1p(count)/math.Log1p(ref))
}

// BoostForEMS 는 점수에 출동 강도를 반영한다.
func BoostForEMS(score, e float64) float64 {
	return score + EMSBoost*e*(1-score)
}
