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
