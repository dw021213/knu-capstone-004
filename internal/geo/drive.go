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

// DriveBands 는 주행시간 등급 경계(분). ≤5 → 1, ≤7 → 2, ≤10 → 3, ≤15 → 4, 초과 → 5.
// 5분: 안전 기준, 7분: 소방 골든타임.
var DriveBands = []float64{5, 7, 10, 15}

// DriveLevel 은 주행시간(분)을 위험 등급 1~5 로 바꾼다.
func DriveLevel(minutes float64) int {
	for i, b := range DriveBands {
		if minutes <= b {
			return i + 1
		}
	}
	return len(DriveBands) + 1
}
