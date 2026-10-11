package geo

import "math"

// Hotspot 은 테스트용 혼잡 지점. 중심에서 가우시안으로 퍼진다(sigma 거리에서 약 0.6배, 2·sigma 에서 약 0.14배).
type Hotspot struct {
	Name      string
	Lat, Lng  float64
	SigmaM    float64
	Intensity float64 // 중심 혼잡도 0~1
}

// MinCongestion 미만은 0 으로 보고 저장하지 않는다.
const MinCongestion = 0.05

// CongestionAt 은 한 지점의 혼잡도(여러 핫스팟 중 최댓값)를 반환한다.
func CongestionAt(lat, lng float64, spots []Hotspot) float64 {
	best := 0.0
	for _, h := range spots {
		d := haversineM(lat, lng, h.Lat, h.Lng)
		v := h.Intensity * math.Exp(-d*d/(2*h.SigmaM*h.SigmaM))
		best = math.Max(best, v)
	}
	if best < MinCongestion {
		return 0
	}
	return best
}

// CongestionScoreCut: 혼잡도 c 일 때 점수 × (1 − 0.6·c). 사람이 많으면 위험도를 낮춘다.
// 등급은 깎인 점수에서 다시 계산한다(LevelFromScore).
const CongestionScoreCut = 0.6

// AdjustForCongestion 은 점수에 혼잡도를 반영한다.
func AdjustForCongestion(score, c float64) float64 {
	return score * (1 - CongestionScoreCut*c)
}

func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371000.0
	toRad := math.Pi / 180
	dLat := (lat2 - lat1) * toRad
	dLng := (lng2 - lng1) * toRad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*toRad)*math.Cos(lat2*toRad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * r * math.Asin(math.Sqrt(a))
}
