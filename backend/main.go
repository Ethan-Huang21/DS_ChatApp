package main

/* Instructions
1. Initialize Dependencies
	go mod init myapp
	go get github.com/pocketbase/pocketbase
	go mod tidy
2. Get Migrations [If no pb_data folder]
	go run main.go migrate up
3. Create Admin [If no pb_data folder]
	go run main.go admin create "junyi.li@ucalgary.ca" "123123123123"
4. Run (requires auth)
	go run main.go serve
5. Tables [If no pb_data folder]
	For our app, once you sign in, import collections of frontend/pb_schema.json
	Automigrate will then create the needed folders in pb_data, and you can uncomment some things.
*/

import (
	"log"
	"os"

	"fmt"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/net/websocket"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	// Uncomment once you have at least one .go migration file in the "pb_migrations directory"
	_ "myapp/pb_data/migrations"
	// Creating Records
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
)

var PK = true
var connectedServers = make(map[*websocket.Conn]bool)

// handle Connections
func handleWebSocket(ws *websocket.Conn) {
	connectedServers[ws] = true
	log.Println("Server Connected: ", ws.RemoteAddr())

	// Keep Websocket Open
	select {}
}

// Sends a message to all connected servers
func broadcastMsg(message string) {
	for pb := range connectedServers {
		if err := websocket.Message.Send(pb, message); err != nil {
			log.Println("Error Sending Message: ", err)
			delete(connectedServers, pb)
		}
	}
}

func handleMessage(ws *websocket.Conn, app *pocketbase.PocketBase, wg *sync.WaitGroup) {
	defer wg.Done()

	for {
		var message string
		err := websocket.Message.Receive(ws, &message)
		if err != nil {
			fmt.Println("Error receiving message: ", err)
			return
		}
		log.Println("Received Message: ", message)

		stArr := strings.Split(message, ":")
		switch len(stArr) {
		case 4:
			// Broadcast is a message ->
			// messageType : messageID : messageContent : messageUser
			//mtype := stArr[0]
			mid := stArr[1]
			mct := stArr[2]
			mus := stArr[3]

			collection, err := app.Dao().FindCollectionByNameOrId("messages")
			if err != nil {
				log.Println("Error in Collection Finding")
			}

			record := models.NewRecord(collection)
			form := forms.NewRecordUpsert(app, record)

			form.LoadData(map[string]any{
				"id":      mid,
				"content": mct,
				"user":    mus,
			})

			// Validate and Submit
			if err := form.Submit(); err != nil {
				log.Println("Error in Submission")
			}
		default:
			log.Println("Error has Occurred")
		}
	}
}

func main() {
	var wg sync.WaitGroup
	port := ":8081"
	http.Handle("/ws", websocket.Handler(handleWebSocket))

	// Attempt to Connect -- as Client
	// Note: This code is entirely localhost-based.
	// host.docker.internal -> looks at host machine's localhost instead of containers
	psAddr := "ws://host.docker.internal:8081/ws"
	ws, err := websocket.Dial(psAddr, "", "http://localhost/")
	if err != nil {
		log.Println("Error connecting to server: ", err)
		// Attempt to Host
		go func() {
			err := http.ListenAndServe("0.0.0.0"+port, nil)
			if err != nil {
				log.Println("Server already running on port 8081")
			}
		}()
	} else {
		log.Println("Connected to Server: ", psAddr)
		PK = false
	}

	// New Pocketbase Instance
	app := pocketbase.New()

	if !PK {
		// Start a Go Routine to handle messages
		wg.Add(1)
		go handleMessage(ws, app, &wg)
	}

	// Serve Static files from the provided public dir (if exists)
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./pb_public"), false))
		return nil
	})

	// Idea -- This could be useful, to get the a most recent (auto-logged) migration file to use
	// in the creation of a new DB. Maybe instead of hardcoded -- leader is true, others is false.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// Enable autocreation of Migration Files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Dir:         "./pb_data/migrations",
		Automigrate: true,
	})

	// Record Creation Test
	// On Record Creation for only "abcd" -- Add a record "Hello" to "test1"
	// Note: This requires Collections 'abcd' and 'test1' to function, but it seemingly works.
	app.OnRecordAfterCreateRequest("messages").Add(func(e *core.RecordCreateEvent) error {
		log.Println("Record Create Event for messages")
		log.Println(e.HttpContext)
		log.Println(e.Record)
		log.Println(e.UploadedFiles)

		if PK {
			log.Println("1:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("content") + ":" + e.Record.OriginalCopy().GetString("user"))
			broadcastMsg("1:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("content") + ":" + e.Record.OriginalCopy().GetString("user"))
		}

		return nil
	})

	// Log Errors that occur on execution (serve)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}

	// https://pocketbase.io/docs/go-routing/ --> HTTP Reading, likely needed to broadcast.
}
