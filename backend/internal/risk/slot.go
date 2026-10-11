package risk

import "time"

// 고립도는 시간대별 유동인구(2015-01 제주도민)로 조건 × 시간대마다 따로 계산한다.

// Condition 은 유동인구 파일 조건. FileTag 는 파일 이름의 "유동인구_비율포함_<FileTag>_20150131.csv" 부분(전체는 "").
type Condition struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Group   string `json:"group"` // day | weather | all
	FileTag string `json:"-"`
}

var Conditions = []Condition{
	{"all", "전체", "all", ""},
	{"weekday", "평일", "day", "평일"},
	{"holiday", "휴일", "day", "휴일"},
	{"preholiday", "휴일전날", "day", "휴일전날"},
	{"clear", "맑음", "weather", "맑음"},
	{"cloudy", "흐림", "weather", "흐림"},
	{"rain", "비", "weather", "비"},
	{"snow", "눈", "weather", "눈"},
}

// ConditionByKey 는 key 로 조건을 찾는다.
func ConditionByKey(key string) (Condition, bool) {
	for _, c := range Conditions {
		if c.Key == key {
			return c, true
		}
	}
	return Condition{}, false
}

// Seoul 은 시간대 기본값 계산 기준 시간대.
var Seoul = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		return time.FixedZone("KST", 9*3600)
	}
	return loc
}()

// DefaultSlot 은 조건·시간을 지정하지 않았을 때 쓰는 값: 현재 한국 시각의 시간대와 요일 구분.
// 토·일 = 휴일, 금 = 휴일전날, 나머지 = 평일. 공휴일 달력은 아직 반영하지 않는다.
// 날씨 조건은 기상 자료 연동 전까지 자동 선택하지 않는다.
func DefaultSlot(now time.Time) (condition string, hour int) {
	t := now.In(Seoul)
	switch t.Weekday() {
	case time.Saturday, time.Sunday:
		condition = "holiday"
	case time.Friday:
		condition = "preholiday"
	default:
		condition = "weekday"
	}
	return condition, t.Hour()
}
