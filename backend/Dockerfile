# 백엔드 서버(+ etl 도구) 이미지. H3 라이브러리가 cgo 를 쓰므로 C 컴파일러가 있는 golang 이미지에서 빌드한다.
#   docker build -t jeju-risk-server .
FROM golang:1.27-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/etl ./cmd/etl

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 app
WORKDIR /app
COPY --from=build /out/ /app/bin/
# 서버가 작업 폴더 기준으로 읽는 파일
COPY config ./config
COPY web ./web
ENV PATH=/app/bin:$PATH TZ=Asia/Seoul GIN_MODE=release
USER app
EXPOSE 8080
CMD ["server"]
