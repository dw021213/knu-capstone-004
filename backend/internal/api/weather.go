package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"jejurisk/internal/weather"
)

// atOf 는 ?at=(KST) 를 읽는다. 형식: 2021-08-23T14:00, 2021-08-23 14:00, 2021-08-23T14, 2021-08-23(0시).
// 없으면 지금. 잘못된 값이면 400 을 쓰고 ok=false.
func atOf(c *gin.Context) (at time.Time, given, ok bool) {
	v := c.Query("at")
	if v == "" {
		return time.Now().In(weather.Seoul).Truncate(time.Hour), false, true
	}
	for _, layout := range []string{"2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02T15", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, v, weather.Seoul); err == nil {
			return t.Truncate(time.Hour), true, true
		}
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": "at 형식은 YYYY-MM-DDTHH:MM (KST)"})
	return time.Time{}, false, false
}

// weatherFor 는 at 시각의 지점별 판별 결과를 SQL 에 넘길 JSON(지점번호 → 결과)과 응답용 요약으로 만든다.
// ?weather=off 이거나 규칙·관측을 못 읽으면 빈 맵(가산 0)을 쓴다.
func (h *Handler) weatherFor(c *gin.Context, at time.Time) (byStn []byte, info gin.H, err error) {
	info = gin.H{"on": c.Query("weather") != "off", "at": at.Format("2006-01-02T15:04"), "status": "off"}
	if !info["on"].(bool) {
		return []byte(`{}`), info, nil
	}
	rules, err := weather.Load(h.WeatherRulesPath)
	if err != nil {
		return nil, nil, err
	}
	snap, err := weather.EvaluateAt(c, h.DB, rules, at)
	if err != nil {
		return nil, nil, err
	}
	m := make(map[string]weather.StationResult, len(snap.Stations))
	alerted := 0
	for stn, sr := range snap.Stations {
		m[strconv.Itoa(stn)] = sr
		if len(sr.Alerts) > 0 {
			alerted++
		}
	}
	if byStn, err = json.Marshal(m); err != nil {
		return nil, nil, err
	}
	status := "ok"
	if snap.Observed == 0 {
		status = "no_data" // 그 시각 관측이 없음 → 가산 0 (안전하다는 뜻 아님)
	}
	info["status"] = status
	info["rules_version"] = rules.Version
	info["max_bonus"] = rules.MaxBonus
	info["stations_observed"] = snap.Observed
	info["stations_alerted"] = alerted
	info["sources"] = snap.Sources
	return byStn, info, nil
}

// weatherMeta 는 /api/risk/meta 의 weather 항목.
func (h *Handler) weatherMeta(c *gin.Context) gin.H {
	out := gin.H{"metrics": weather.MetricLabels()}
	if rules, err := weather.Load(h.WeatherRulesPath); err == nil {
		out["rules"] = rules
	} else {
		out["rules_error"] = err.Error()
	}
	type src struct {
		Source string    `json:"source"`
		From   time.Time `json:"from"`
		To     time.Time `json:"to"`
		Rows   int64     `json:"rows"`
	}
	var sources []src
	rows, err := h.DB.Query(c, `SELECT source, min(ts), max(ts), count(*) FROM weather_obs GROUP BY source ORDER BY source`)
	if err == nil {
		for rows.Next() {
			var s src
			if rows.Scan(&s.Source, &s.From, &s.To, &s.Rows) == nil {
				s.From, s.To = s.From.In(weather.Seoul), s.To.In(weather.Seoul)
				sources = append(sources, s)
			}
		}
		rows.Close()
	}
	out["observations"] = sources
	out["usage"] = "?at=YYYY-MM-DDTHH:MM(KST, 생략 시 지금)로 그 시각 관측을 판별, ?weather=off 로 가산 끔. " +
		"risk_*·hazard_* 는 가산 반영값, base_* 는 가산 전, weather_bonus·weather_alerts 는 가산 내역"
	out["formula"] = "최종 = min(1, 기존 점수 + min(max_bonus, Σ 기준 초과 항목 가중치)), 등급은 가산 전 점수 분포(분위수)에 대어 다시 매김"
	return out
}
