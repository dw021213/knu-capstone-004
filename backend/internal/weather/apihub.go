package weather

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
)

// Seoul 은 관측 시각 기준(KST).
var Seoul = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		return time.FixedZone("KST", 9*3600)
	}
	return loc
}()

// APIHub 는 기상청 API허브 클라이언트 (https://apihub.kma.go.kr). 인증키는 KMA_APIHUB_KEY.
type APIHub struct {
	Key    string
	Client *http.Client
}

func NewAPIHub(key string) *APIHub {
	return &APIHub{Key: key, Client: &http.Client{Timeout: 60 * time.Second}}
}

// get 은 API허브가 가끔 504 를 내서 몇 번 다시 시도한다. 응답은 CP949 텍스트일 수 있어 UTF-8 로 바꾼다.
func (a *APIHub) get(ctx context.Context, path string, q url.Values) ([]byte, error) {
	q.Set("authKey", a.Key)
	u := "https://apihub.kma.go.kr/api/typ01/url/" + path + "?" + q.Encode()
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt*3) * time.Second):
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		resp, err := a.Client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("API허브 %s HTTP %d: %s", path, resp.StatusCode, firstLine(body))
			if resp.StatusCode >= 500 {
				continue
			}
			return nil, lastErr
		}
		if !utf8.Valid(body) {
			if b, err := korean.EUCKR.NewDecoder().Bytes(body); err == nil {
				body = b
			}
		}
		if bytes.HasPrefix(bytes.TrimSpace(body), []byte("{")) { // 오류는 JSON 으로 온다 (인증·활용신청)
			return nil, fmt.Errorf("API허브 %s: %s", path, firstLine(body))
		}
		return body, nil
	}
	return nil, lastErr
}

func firstLine(b []byte) string {
	s := strings.Join(strings.Fields(string(b)), " ")
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// Station 은 AWS 지점.
type Station struct {
	Stn      int
	Name     string
	Lon, Lat float64
	HeightM  float64
	Mountain bool
	Address  string
}

// FetchJejuStations 는 AWS 지점정보에서 제주특별자치도 지점만 돌려준다.
func (a *APIHub) FetchJejuStations(ctx context.Context) ([]Station, error) {
	body, err := a.get(ctx, "stn_inf.php", url.Values{
		"inf": {"AWS"}, "stn": {""}, "tm": {time.Now().In(Seoul).Format("200601021504")},
	})
	if err != nil {
		return nil, err
	}
	var out []Station
	sc := bufio.NewScanner(bytes.NewReader(body))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "#") || !strings.Contains(line, "제주특별자치도") {
			continue
		}
		// STN LON LAT STN_SP HT HT_WD LAU STN(AD) STN_KO STN_EN FCT_ID LAW_ID BASIN LAW_ADDR...
		p := strings.Fields(line)
		if len(p) < 14 {
			continue
		}
		stn, err1 := strconv.Atoi(p[0])
		lon, err2 := strconv.ParseFloat(p[1], 64)
		lat, err3 := strconv.ParseFloat(p[2], 64)
		ht, _ := strconv.ParseFloat(p[4], 64)
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		addr := strings.Join(p[13:], " ")
		out = append(out, Station{
			Stn: stn, Name: p[8], Lon: lon, Lat: lat, HeightM: ht, Address: addr,
			Mountain: strings.Contains(addr, "(산지)"),
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("API허브 지점정보에 제주 지점이 없음: %s", firstLine(body))
	}
	return out, nil
}

// FetchHourly 는 정시자료(awsh)에서 t 시각 관측을 받아 stations 에 있는 지점만 돌려준다.
// 열: YYMMDDHHMI STN TA WD WS RN_DAY RN_HR1 HM PA PS (결측 −99 계열)
func (a *APIHub) FetchHourly(ctx context.Context, t time.Time, stations map[int]bool) ([]Obs, error) {
	t = t.In(Seoul).Truncate(time.Hour)
	body, err := a.get(ctx, "awsh.php", url.Values{"tm": {t.Format("200601021504")}})
	if err != nil {
		return nil, err
	}
	var out []Obs
	sc := bufio.NewScanner(bytes.NewReader(body))
	for sc.Scan() {
		p := strings.Fields(sc.Text())
		if len(p) < 8 || strings.HasPrefix(p[0], "#") {
			continue
		}
		stn, err := strconv.Atoi(p[1])
		if err != nil || !stations[stn] {
			continue
		}
		ts, err := time.ParseInLocation("200601021504", p[0], Seoul)
		if err != nil {
			continue
		}
		out = append(out, Obs{
			Stn: stn, TS: ts, Source: "apihub",
			TA: num(p[2]), WS: num(p[4]), RN1h: num(p[6]), HM: num(p[7]),
		})
	}
	return out, nil
}

// num 은 숫자로 읽되 결측(−90 이하, 빈칸)은 nil.
func num(s string) *float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || v <= -90 {
		return nil
	}
	return &v
}
