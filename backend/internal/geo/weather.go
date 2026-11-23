package geo

import "math"

// KMAWeatherGrid projects WGS84 coordinates onto KMA's 5 km neighborhood forecast grid.
func KMAWeatherGrid(lat, lng float64) (nx, ny int) {
	const (
		rad     = math.Pi / 180
		radius  = 6371.00877 // km
		spacing = 5.0        // km
		lat1    = 30 * rad
		lat2    = 60 * rad
		lat0    = 38 * rad
		lng0    = 126 * rad
		x0      = 43.0
		y0      = 136.0
	)
	// Lambert conformal conic projection from the KMA API guide.
	tan1 := math.Tan(math.Pi/4 + lat1/2)
	tan2 := math.Tan(math.Pi/4 + lat2/2)
	n := math.Log(math.Cos(lat1)/math.Cos(lat2)) / math.Log(tan2/tan1)
	scale := (radius / spacing) * math.Pow(tan1, n) * math.Cos(lat1) / n
	originRadius := scale / math.Pow(math.Tan(math.Pi/4+lat0/2), n)
	pointRadius := scale / math.Pow(math.Tan(math.Pi/4+lat*rad/2), n)
	theta := n * math.Remainder(lng*rad-lng0, 2*math.Pi)
	return int(math.Floor(x0 + pointRadius*math.Sin(theta) + 0.5)),
		int(math.Floor(y0 + originRadius - pointRadius*math.Cos(theta) + 0.5))
}
