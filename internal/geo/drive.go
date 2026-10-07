package geo

// 직선거리 → 차량 주행시간 근사.
// 실제 도로망(OSRM 등)으로 바꾸기 전까지 쓰는 값이라 한 곳에 모아 둔다.
const (
	DriveSpeedKmh  = 40.0 // 제주 시내·읍면 평균 주행 속도 가정
	DriveDetour    = 1.3  // 도로 우회계수 (도로거리 / 직선거리)
	driveMPerMinut = DriveSpeedKmh * 1000 / 60
)

// DriveMinutes 는 직선거리(m)를 예상 주행시간(분)으로 환산한다. 5분 ≈ 직선 2.56km.
func DriveMinutes(straightM float64) float64 {
	return straightM * DriveDetour / driveMPerMinut
}

// 위험도 점수(0~1)는 주행시간에서 구간별 직선 보간으로 만든다.
// 소방서 바로 옆(0분)도 0.25(=2등급)에서 시작한다. 1등급은 혼잡도로 점수가 깎였을 때만 나온다.
//
//	주행시간  0분 → 0.25   (2등급)
//	          5분 → 0.40   (2/3등급 경계)
//	         10분 → 0.60   (3/4등급 경계)
//	         15분 → 0.80   (4/5등급 경계)
//	         30분 → 1.00   (이상은 1.0)
var driveScoreAnchors = [][2]float64{{0, 0.25}, {5, 0.40}, {10, 0.60}, {15, 0.80}, {30, 1.00}}

// DriveScore 는 주행시간(분)을 위험도 점수 0.25~1.0 으로 바꾼다.
func DriveScore(minutes float64) float64 {
	a := driveScoreAnchors
	if minutes <= a[0][0] {
		return a[0][1]
	}
	for i := 1; i < len(a); i++ {
		if minutes <= a[i][0] {
			t := (minutes - a[i-1][0]) / (a[i][0] - a[i-1][0])
			return a[i-1][1] + t*(a[i][1]-a[i-1][1])
		}
	}
	return a[len(a)-1][1]
}

// LevelFromScore 는 점수를 등급 1~5 로 바꾼다 (0.2 간격: <0.2 → 1, <0.4 → 2, … ≥0.8 → 5).
// 지도 범례·색(web/index.html)도 같은 경계를 쓴다.
func LevelFromScore(score float64) int {
	return max(1, min(5, int(score/0.2)+1))
}
