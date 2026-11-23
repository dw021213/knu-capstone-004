package api

import (
	"os"
	"strings"
)

// serverAPIKey prefers the environment and also supports the team's local key file.
func serverAPIKey(name string) string {
	if key := strings.TrimSpace(os.Getenv(name)); key != "" {
		return key
	}
	for _, path := range []string{".env.local", "../.env.local"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var key string
		for _, line := range strings.Split(string(raw), "\n") {
			variable, value, ok := strings.Cut(strings.TrimSpace(line), "=")
			if ok && variable == name {
				key = strings.Trim(value, "\"' ")
			}
		}
		if key != "" {
			return key
		}
	}
	return ""
}
