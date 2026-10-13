// Package envfile 은 실행 폴더의 .env 를 읽어 환경변수로 넣는다(이미 설정된 값은 덮어쓰지 않음).
package envfile

import (
	"bufio"
	"os"
	"strings"
)

// Load 는 path(.env)가 있으면 KEY=VALUE 줄을 읽는다. # 주석, 빈 줄, 양끝 따옴표 처리.
func Load(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
}
