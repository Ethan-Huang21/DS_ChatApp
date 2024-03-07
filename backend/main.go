package main

// To init dependencies:
// run: go mod init myapp && go mod tidy
//  Install via: go get github.com/pocketbase/pocketbase
// To Start Application:
// run: go run main.go serve
// To build a statically linked executable
// run: CGO_ENABLED=0 go build
// and then start the created executable with ./myapp serve
import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	// Uncomment once you have at least one .go migration file in the "pb_migrations directory"
)

func main() {
	// New Pocketbase Instance
	app := pocketbase.New()

	// Serve Static files from the provided public dir (if exists)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./pb_public"), false))
		return nil
	})

	// Idea -- This could be useful, to get the a most recent (auto-logged) migration file to use
	// in the creation of a new DB.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// Enable autocreation of Migration Files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Dir:         "./pb_data/migrations",
		Automigrate: true,
	})

	// Log Errors that occur on execution (serve)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}

	// https://pocketbase.io/docs/go-routing/ --> HTTP Reading, likely needed to broadcast.
}
