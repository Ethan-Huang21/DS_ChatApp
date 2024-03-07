FROM alpine:latest

# ARG PB_VERSION=0.22.2

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    bash \
    curl \
    git

# download and unzip PocketBase
# ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
# RUN unzip /tmp/pb.zip -d /pb/

# uncomment to copy the local pb_migrations dir into the image
# COPY ./pb_migrations /pb/pb_migrations

# uncomment to copy the local pb_hooks dir into the image
# COPY ./pb_hooks /pb/pb_hooks

# Install Go
RUN mkdir -p /usr/local/go \
    && curl -fsSL https://golang.org/dl/go1.22.1.linux-amd64.tar.gz | tar -xz -C /usr/local/go --strip-components=1

# Set Go environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

COPY ./pb_data ./pb/pb_data
COPY ./main.go ./pb/

# Copy the shell script into the builder stage, make it executable
COPY ./setup.sh /pb/
RUN chmod +x /pb/setup.sh

EXPOSE 8080

# start PocketBase
# CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080"]
CMD ["./pb/setup.sh"]