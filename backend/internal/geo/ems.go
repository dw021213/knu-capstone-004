package geo

import "math"

// 구급출동 건수로 위험도 점수를 만든다 (테스트 규칙).
//
//	강도 e = log(1+건수) / log(1+기준건수), 0~1 로 자름. 기준건수 = 출동 있는 셀들의 99 백분위.
//	점수 = 0.25 + 0.75·e   (출동 없는 셀 0.25 = 2등급, 기준건수 이상 1.0 = 5등급)
//
// 건수는 도심에 몰려 있어 로그를 씌워 외곽의 몇 건도 반영되게 한다.
const (
	EMSBaseScore  = 0.25
	EMSPercentile = 0.99
)

// EMSIntensity 는 셀 출동 건수를 0~1 강도로 바꾼다.
func EMSIntensity(count, ref float64) float64 {
	if count <= 0 || ref <= 0 {
		return 0
	}
	return math.Min(1, math.Log1p(count)/math.Log1p(ref))
}

// EMSScore 는 출동 강도를 위험도 점수(0.25~1.0)로 바꾼다.
func EMSScore(e float64) float64 {
	return EMSBaseScore + (1-EMSBaseScore)*e
}

// LevelFromScore 는 점수를 등급 1~5 로 바꾼다 (0.2 간격: <0.2 → 1, <0.4 → 2, … ≥0.8 → 5).
// 지도 색(web/index.html COLOR_STOPS)도 같은 경계를 쓴다.
func LevelFromScore(score float64) int {
	return max(1, min(5, int(score/0.2)+1))
}
