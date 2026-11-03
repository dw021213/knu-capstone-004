package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
)

// safetyRules 는 config/safety_rules.json (인근 안전시설 지수). 계산은 SQL(safetySQL)이 한다.
type safetyRules struct {
	Version     string  `json:"version"`
	Description string  `json:"description"`
	Weighting   string  `json:"weighting"`
	Alpha       float64 `json:"alpha"`
	Items       []struct {
		Key      string  `json:"key"`
		Label    string  `json:"label"`
		Facility string  `json:"facility"`
		Metric   string  `json:"metric"`
		FullAt   float64 `json:"full_at"`
		ZeroAt   float64 `json:"zero_at"`
		Weight   float64 `json:"weight"`
		Evidence string  `json:"evidence"`
	} `json:"items"`
}

var safetyMetrics = map[string]bool{"nearest_dist_m": true, "nearest_drive_min": true, "count_k1": true, "count_in_cell": true}

func loadSafetyRules(path string) (*safetyRules, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var r safetyRules
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if r.Alpha < 0 || r.Alpha > 1 {
		return nil, fmt.Errorf("%s: alpha 는 0~1", path)
	}
	if len(r.Items) == 0 {
		return nil, errors.New(path + ": items 없음")
	}
	for _, it := range r.Items {
		if !safetyMetrics[it.Metric] || it.FullAt == it.ZeroAt || it.Weight <= 0 {
			return nil, fmt.Errorf("%s: %s 항목 metric·full_at·zero_at·weight 확인", path, it.Key)
		}
	}
	return &r, nil
}

// safetyFor 는 SQL 에 넘길 규칙 JSON({alpha, items})과 응답용 요약을 만든다.
// 지수는 늘 계산해 내보내고, ?safety=on 일 때만 alpha 를 그대로 넘겨 최종 위험도에서 뺀다(그 외 alpha 0).
func (h *Handler) safetyFor(c *gin.Context) (param []byte, info gin.H, err error) {
	on := c.Query("safety") == "on"
	info = gin.H{"on": on}
	if h.SafetyRulesPath == "" {
		info["status"] = "off"
		return []byte(`{"alpha":0,"items":[]}`), info, nil
	}
	r, err := loadSafetyRules(h.SafetyRulesPath)
	if err != nil {
		return nil, nil, err
	}
	alpha := 0.0
	if on {
		alpha = r.Alpha
	}
	param, err = json.Marshal(gin.H{"alpha": alpha, "items": r.Items})
	info["status"] = "ok"
	info["rules_version"] = r.Version
	info["alpha"] = r.Alpha
	return param, info, err
}

// safetyMeta 는 /api/risk/meta 의 safety 항목.
func (h *Handler) safetyMeta() gin.H {
	r, err := loadSafetyRules(h.SafetyRulesPath)
	if err != nil {
		return gin.H{"error": err.Error()}
	}
	return gin.H{
		"rules_version": r.Version,
		"description":   r.Description,
		"weighting":     r.Weighting,
		"alpha":         r.Alpha,
		"items":         r.Items,
		"usage":         "safety_score 는 늘 포함. ?safety=on 이면 최종 위험도 = max(0, 모델 + 기상 가산 − alpha × safety_score)",
	}
}

// safetyCTE 는 셀별 안전시설 지수. $p 는 safetyFor 의 규칙 JSON 자리.
// 시설별 점수 = clamp((zero_at − 값) / (zero_at − full_at), 0, 1) — 거리(작을수록 좋음)·개수(클수록 좋음) 모두 이 식 하나로 된다.
// 값이 없으면(시설 통계 없음) 그 항목은 0점.
func safetyCTE(p string) string {
	return `sf AS (
  SELECT s.h3_index,
         sum(r.weight * COALESCE(sc.v, 0)) / sum(r.weight) AS score,
         jsonb_object_agg(r.key, jsonb_build_object('value', round(m.v::numeric, 1), 'score', round(COALESCE(sc.v, 0)::numeric, 2))) AS detail
  FROM cell_facility_stat s
  JOIN jsonb_to_recordset(` + p + `::jsonb -> 'items')
       AS r(key text, facility text, metric text, full_at float8, zero_at float8, weight float8) ON r.facility = s.type
  CROSS JOIN LATERAL (SELECT CASE r.metric
      WHEN 'nearest_dist_m' THEN s.nearest_dist_m WHEN 'nearest_drive_min' THEN s.nearest_drive_min
      WHEN 'count_k1' THEN s.count_k1 WHEN 'count_in_cell' THEN s.count_in_cell END AS v) m
  CROSS JOIN LATERAL (SELECT GREATEST(0, LEAST(1, (r.zero_at - m.v) / (r.zero_at - r.full_at))) AS v) sc
  GROUP BY s.h3_index
)`
}
