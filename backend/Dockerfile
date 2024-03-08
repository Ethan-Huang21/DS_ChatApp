FROM alpine:latest

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    bash \
    curl \
    git

# Install Go
RUN mkdir -p /usr/local/go \
    && curl -fsSL https://golang.org/dl/go1.22.1.linux-amd64.tar.gz | tar -xz -C /usr/local/go --strip-components=1

# Set Go environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

# Copy Local pb_data folder into pb_data in /pb/pb_data in containers
COPY ./main.go ./pb/
COPY ./pb_data ./pb/pb_data

# Copy the shell script into the builder stage, make it executable.
COPY ./setup.sh ./pb/
RUN dos2unix /pb/setup.sh
RUN chmod +x /pb/setup.sh

EXPOSE 8080

# start PocketBase
# CMD ["ls", "-l", "/pb/"]
CMD ["./pb/setup.sh"]