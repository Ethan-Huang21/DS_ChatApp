#!/bin/sh

# Start PocketBase serve
# exec /pb/pocketbase serve --http=0.0.0.0:8080

cd /pb

go mod init myapp
go get github.com/pocketbase/pocketbase
go mod tidy

go run main.go serve --http=0.0.0.0:8080