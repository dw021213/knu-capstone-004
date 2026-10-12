package weather

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
)

// ReadKMACSV 는 기상자료개방포털(data.kma.go.kr) 지상(AWS·ASOS) 시간자료 CSV 를 읽는다.
// 열 순서가 다운로드 옵션마다 달라서 머리글 이름으로 찾는다:
// 지점, 일시, 기온, 풍속, 강수량, 습도, 적설 (단위 표기 "(°C)" 등은 무시). 없는 열은 결측.
func ReadKMACSV(path string) ([]Obs, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	if !utf8.Valid(raw) {
		if raw, err = korean.EUCKR.NewDecoder().Bytes(raw); err != nil {
			return nil, fmt.Errorf("%s CP949 변환: %w", path, err)
		}
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("%s: 자료 없음", path)
	}
	col := func(names ...string) int {
		for i, h := range rows[0] {
			h = strings.TrimSpace(h)
			for _, n := range names {
				if strings.HasPrefix(h, n) {
					return i
				}
			}
		}
		return -1
	}
	iStn, iTS := col("지점"), col("일시")
	if iStn < 0 || iTS < 0 {
		return nil, fmt.Errorf("%s: '지점'·'일시' 열이 없음 (머리글: %v)", path, rows[0])
	}
	// "지점명" 도 "지점" 으로 시작하므로 숫자 열을 고른다
	if _, err := strconv.Atoi(strings.TrimSpace(rows[1][iStn])); err != nil {
		for i, h := range rows[0] {
			if strings.TrimSpace(h) == "지점" {
				iStn = i
			}
		}
	}
	iTA, iWS, iRN, iHM := col("기온"), col("풍속"), col("강수량"), col("습도")
	iSnow := col("적설")
	get := func(row []string, i int) *float64 {
		if i < 0 || i >= len(row) {
			return nil
		}
		return num(row[i])
	}
	var out []Obs
	for _, row := range rows[1:] {
		if len(row) <= iTS {
			continue
		}
		stn, err := strconv.Atoi(strings.TrimSpace(row[iStn]))
		if err != nil {
			continue
		}
		ts, err := parseKMATime(row[iTS])
		if err != nil {
			return nil, fmt.Errorf("%s: 일시 %q: %w", path, row[iTS], err)
		}
		o := Obs{Stn: stn, TS: ts, Source: "kma_csv",
			TA: get(row, iTA), WS: get(row, iWS), RN1h: get(row, iRN), HM: get(row, iHM), Snow: get(row, iSnow)}
		// 기상자료개방포털 시간자료는 비가 안 온 시간의 강수량을 빈칸으로 둔다 → 기온 등 다른 관측이 있으면 0mm
		if o.RN1h == nil && iRN >= 0 && (o.TA != nil || o.WS != nil) {
			zero := 0.0
			o.RN1h = &zero
		}
		out = append(out, o)
	}
	return out, nil
}

func parseKMATime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	for _, layout := range []string{"2006-01-02 15:04", "2006-01-02 15:04:05", "2006-01-02 15", "2006/01/02 15:04", "200601021504"} {
		if t, err := time.ParseInLocation(layout, s, Seoul); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("알 수 없는 시각 형식")
}
