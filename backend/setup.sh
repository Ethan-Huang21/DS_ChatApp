#!/bin/sh

# Start PocketBase serve
# exec /pb/pocketbase serve --http=0.0.0.0:8080

# --http=$HOST_IP:8080
HOST_IP=$(hostname -i)

cd /pb

# Initialize Dependencies.
go mod init myapp
go get github.com/pocketbase/pocketbase
go mod tidy

# --http=0.0.0.0:8080
go run main.go serve --http=$HOST_IP:8080