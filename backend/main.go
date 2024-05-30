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
	"regexp"
	"sync"
	"time"

	"golang.org/x/net/websocket"

	"github.com/labstack/echo/v5"
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

var PKM sync.Mutex
var PK = false
var isConnected = false
var connectedServers = make(map[*websocket.Conn]bool)

// Needs to know the IP's of all the other Replicas (and itself)
var serverList = []string{
	"ws://localhost:8090",
	"ws://localhost:8091",
}

// handle Connections
func handleWebSocket(ws *websocket.Conn) {
	connectedServers[ws] = true
	log.Println("Server Connected: ", ws.RemoteAddr())

	// Keep Websocket Open
	select {}
}

// Function to Remove and Close a Websocket Connection
func removeConn(ws *websocket.Conn) {
	// Delete it from the map
	delete(connectedServers, ws)
	ws.Close()
}

// Function to return an ACK
func sendACK(ws *websocket.Conn) {
	// Send ACK
	if err := websocket.Message.Send(ws, "ACK"); err != nil {
		log.Println("Error Sending ACK: ", err)
	}
}

// Sends a message to all connected servers, await ACK response
func broadcastMsg(message string) {
	for pb := range connectedServers {
		// Broadcast message
		if err := websocket.Message.Send(pb, message); err != nil {
			log.Println("Error Sending Message: ", err)
			removeConn(pb)
			continue
		}

		// Create a timer and ensure it gets cleaned up after function exits
		timeout := time.NewTimer(500 * time.Millisecond)
		defer timeout.Stop()

		// Create a signal channel to communicate with Routines
		fin := make(chan struct{})

		// Create a routine that waits for either a Timeout or ACK.
		go func(pb *websocket.Conn, fin chan struct{}) {
			// Once this routine exits, clean up the channel
			// Meaning it signals that the ACK was received, or an error occurred.
			defer close(fin)
			// Wait for Response before continuing
			var ACK string
			if err := websocket.Message.Receive(pb, &ACK); err != nil {
				// If an error was received, then sleep for 0.55s, ensuring timeout
				log.Println("Error: Receiving ACK: ", err)
				time.Sleep(550 * time.Millisecond)
				return
			}
			log.Println("ACK Received: ", ACK)
		}(pb, fin)

		// Wait for multiple channel operations simultaneously
		// Executes Default -- unless another case is prepared.
		select {
		// Timeout -- If it reaches 2s, no ACK is received.
		case <-timeout.C:
			log.Println("Error: ACK Timeout")
			removeConn(pb)
		case <-fin:
			// Nothing
		}
	}
}

func handleMessage(ws *websocket.Conn, app *pocketbase.PocketBase, wg *sync.WaitGroup) {
	defer wg.Done()

	for {
		// Attempt to Connect
		// host.docker.internal -> looks at host machine's localhost instead of containers
		// Note -- this still relies on localhost to succeed
		// This doesn't work purely with docker containers unless --network is ran with Docker.
		// We have two options:
		//	1. Connect to active LB, which sends a message of whose the primary -- connect to it
		//		-- Saves us the persistent checking, and keeps other replicas unknown from one-another
		//	2. Check all known replicas, who's hosting
		//		-- What's currently implemented here -- we keep checking until we connect.
		//		-- Operates under the assumption that LB only sends writes to primary.
		//			primary will create a server, so replicas can differentiate broadcast vs write
		//			based off of active websocket connection.
		PKM.Lock()
		if !isConnected && !PK {
			// Iterate through the serverList, attempting to connect
			for _, ip := range serverList {
				log.Println("Attempting to Connect to p:8081 at:", ip)
				var err error

				psAddr := "ws://" + ip + ":8081/ws"
				origin := "http://" + ip + "/"

				// Note: to make this work with Docker, replace origin w/
				// "http://localhost/"
				ws, err = websocket.Dial(psAddr, "", origin)
				if err != nil {
					log.Println("Error connecting to", ip, ":8081:", err)
					continue
				}
				isConnected = true
				log.Println("Connected to: ", ip, ":8081")
				break
			}
			PKM.Unlock()
			// If we didn't get a connection, loop again
			if !isConnected && !PK {
				time.Sleep(2 * time.Second) // Retry after 2 seconds
				continue
			}
		} else {
			PKM.Unlock()
		}

		if isConnected {
			for {
				var message string
				err := websocket.Message.Receive(ws, &message)
				if err != nil {
					// Websocket Closure
					if err.Error() == "EOF" {
						log.Println("Connection Closed. Reconnecting...")
						isConnected = false
						ws.Close()
						break
					}
					fmt.Println("Error receiving message: ", err)
					break
				}

				// Combined Regex Pattern [Message] and [User]
				// Note -- matches[3] appears due to a bug, but matches[4] is messageContent
				// [User] --> 1-Type, 2-ID, 5-Name, 6-Created, 7-Updated
				// [Message] --> 1-Type, 2-ID, 4-Content, 5-Name, 6-Created, 7-Updated
				pattern := `^([^:]+):([^:]+):((.*?):)?([^:]+)\|([^|]+)\|([^|]+)$`

				regex := regexp.MustCompile(pattern)
				matches := regex.FindStringSubmatch(message)

				// Testing - Print Contents
				if len(matches) > 0 {
					for i, match := range matches[1:] {
						fmt.Printf("Group %d: %s\n", i+1, match)
					}
				} else {
					fmt.Println("Matches is Empty")
				}

				log.Println("Received Message: ", message)

				switch matches[1] {
				case "1":
					collection, err := app.Dao().FindCollectionByNameOrId("messages")
					if err != nil {
						log.Println("Error in Collection Finding")
					}

					record := models.NewRecord(collection)
					form := forms.NewRecordUpsert(app, record)

					form.LoadData(map[string]any{
						"id":      matches[2],
						"content": matches[4],
						"user":    matches[5],
						"created": matches[6],
						"updated": matches[7],
					})

					record.Set("created", matches[6])
					record.Set("updated", matches[7])

					// Validate and Submit
					log.Println("Form Message Submit")
					if err := form.Submit(); err != nil {
						log.Println("Error in Submission: ", err)
					} else {
						// Send ACK if submission was validated.
						sendACK(ws)
					}

				case "2":
					collection, err := app.Dao().FindCollectionByNameOrId("users")
					if err != nil {
						log.Println("Error in Collection Finding")
					}

					record := models.NewRecord(collection)
					form := forms.NewRecordUpsert(app, record)

					form.LoadData(map[string]any{
						"id":       matches[2],
						"username": matches[5],
						"created":  matches[6],
						"updated":  matches[7],
					})

					record.Set("created", matches[6])
					record.Set("updated", matches[7])

					// Validate and Submit
					log.Println("Form User Submit")
					if err := form.Submit(); err != nil {
						log.Println("Error in Submission")
					} else {
						// Send ACK if submission was validated.
						sendACK(ws)
					}
				default:
					log.Println("Error has Occurred")
				}
			}
		} else {
			// Primary -- sleep for 100 seconds
			log.Println("Sleeping...")
			time.Sleep(100 * time.Second)
		}
	}
}

func main() {
	var wg sync.WaitGroup
	var ws *websocket.Conn
	port := ":8081"
	http.Handle("/ws", websocket.Handler(handleWebSocket))

	// Attempt to Connect -- as Client
	// Note: This code is entirely localhost-based.

	// New Pocketbase Instance
	app := pocketbase.New()

	// Start a Go Routine to handle messages
	wg.Add(1)
	go handleMessage(ws, app, &wg)

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

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// route for load balancer to send database update
		e.Router.POST("/update", func(c echo.Context) error {
			data := struct {
				// must be capatlized for Echo to recognize
				Content string `json:"content"`

				// collection      string `json:"collection"`
				// content       	string `json:"content"`
				User string `json:"user"`
				// created			string `json:"created"`
				// updated			string `json:"updated"`

			}{}

			if err := c.Bind(&data); err != nil {
				return apis.NewBadRequestError("Failed to read request data", err)
			}

			collection, err := app.Dao().FindCollectionByNameOrId("messages")
			if err != nil {
				log.Println("Error in Collection Finding")
			}
			record := models.NewRecord(collection)

			record.Set("user", data.User)
			record.Set("content", data.Content)

			// Submit
			if err := app.Dao().SaveRecord(record); err != nil {
				return err
			}

			// if successful update send ack as response
			log.Println(data)
			return c.String(http.StatusOK, "ACK")
		}, apis.ActivityLogger(app))

		return nil
	})

	app.OnModelBeforeCreate("messages", "users").Add(func(e *core.ModelEvent) error {
		log.Println("Model Before Create")

		// If websocket isn't open and we're considered a replica, but we got a write request
		// Then we must be the primary -- thus, Host a server.
		// Wait 3s (check-down-time), proceed.
		PKM.Lock()
		if !isConnected && !PK {
			PK = true
			log.Println("No Active Connection -- We must be the Primary")
			PKM.Unlock()
			go func() {
				err := http.ListenAndServe("0.0.0.0"+port, nil)
				if err != nil {
					log.Println("Server already running on port 8081")
				}
			}()
			time.Sleep(3 * time.Second)
		} else {
			PKM.Unlock()
		}

		return nil
	})

	// Record Creation Test
	// Note: This requires Collections 'messages' and 'users' to function

	app.OnModelAfterCreate("messages").Add(func(e *core.ModelEvent) error {
		log.Println("Model create event for messages")
		// log.Println(e.Model.GetId)
		// log.Println(e.Model.(*models.Record).GetString("content"))
		// log.Println(e.Model.(*models.Record).GetString("username"))
		// log.Println(e.Model.(*models.Record).Created.String())
		// log.Println(e.Model.(*models.Record).Updated.String())

		record := e.Model.(*models.Record)
		log.Println(record.Id)
		log.Println(record.GetString("content"))
		log.Println(record.GetString("user"))

		if PK {
			log.Println("1:" + record.Id + ":" + record.GetString("content") + ":" + record.GetString("user") + "|" + record.Created.String() + "|" + record.Updated.String())
			broadcastMsg("1:" + record.Id + ":" + record.GetString("content") + ":" + record.GetString("user") + "|" + record.Created.String() + "|" + record.Updated.String())
		}

		return nil
	})

	app.OnModelAfterCreate("users").Add(func(e *core.ModelEvent) error {
		log.Println("Model create event for users")
		record := e.Model.(*models.Record)
		log.Println(record.Id)
		log.Println(record.GetString("username"))
		log.Println(record.Id)

		if PK {
			log.Println("2:" + record.Id + ":" + record.GetString("username") + "|" + record.Created.String() + "|" + record.Updated.String())
			broadcastMsg("2:" + record.Id + ":" + record.GetString("username") + "|" + record.Created.String() + "|" + record.Updated.String())
		}

		return nil
	})

	/* Test Code -- This code is the equivalent of the above, barring HTTP handling */
	// app.OnRecordBeforeCreateRequest("messages", "users").Add(func(e *core.RecordCreateEvent) error {
	// 	log.Println("Record Create Event Before messages | user")
	// 	log.Println(e.HttpContext)
	// 	log.Println(e.Record)
	// 	log.Println(e.UploadedFiles)

	// 	// If websocket isn't open and we're considered a replica, but we got a write request
	// 	// Then we must be the primary -- thus, Host a server.
	// 	// Wait 3s (check-down-time), proceed.
	// 	if ws == nil && !PK {
	// 		PKM.Lock()
	// 		PK = true
	// 		log.Println("No Active Connection -- We must be the Primary")
	// 		PKM.Unlock()
	// 		go func() {
	// 			err := http.ListenAndServe("0.0.0.0"+port, nil)
	// 			if err != nil {
	// 				log.Println("Server already running on port 8081")
	// 			}
	// 		}()
	// 		time.Sleep(3 * time.Second)
	// 	}

	// 	return nil
	// })

	// app.OnRecordAfterCreateRequest("messages").Add(func(e *core.RecordCreateEvent) error {

	// 	// log.Println("Record Create Event for messages")
	// 	// log.Println()
	// 	// log.Println(e.Model.(*models.Record).GetString("username"))

	// 	//broadcastMsg("1:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("content") + ":" + e.Record.OriginalCopy().GetString("user") + "|" + e.Record.Created.String() + "|" + e.Record.Updated.String())

	// 	log.Println("Record Create Event for messages")
	// 	log.Println(e.HttpContext)
	// 	log.Println(e.Record)
	// 	log.Println(e.UploadedFiles)
	// 	log.Println(e.Record.Created)
	// 	log.Println("This is id" + e.Record.Id)
	// 	log.Println("This is the content" + e.Record.OriginalCopy().GetString("content"))
	// 	log.Println("This is user" + e.Record.OriginalCopy().GetString("user"))

	// 	if PK {
	// 		log.Println("1:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("content") + ":" + e.Record.OriginalCopy().GetString("user") + "|" + e.Record.Created.String() + "|" + e.Record.Updated.String())
	// 		broadcastMsg("1:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("content") + ":" + e.Record.OriginalCopy().GetString("user") + "|" + e.Record.Created.String() + "|" + e.Record.Updated.String())
	// 	}

	// 	return nil
	// })

	// app.OnRecordAfterCreateRequest("users").Add(func(e *core.RecordCreateEvent) error {
	// 	log.Println("Record Create Event for users")
	// 	log.Println(e.HttpContext)
	// 	log.Println(e.Record)
	// 	log.Println(e.UploadedFiles)
	// 	log.Println(e.Record.Created.String())
	// 	log.Println(e.Record.Updated.String())

	// 	if PK {
	// 		log.Println("2:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("username") + "|" + e.Record.Created.String() + "|" + e.Record.Updated.String())
	// 		broadcastMsg("2:" + e.Record.Id + ":" + e.Record.OriginalCopy().GetString("username") + "|" + e.Record.Created.String() + "|" + e.Record.Updated.String())
	// 	}

	// 	return nil
	// })

	// Log Errors that occur on execution (serve)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}

	// https://pocketbase.io/docs/go-routing/ --> HTTP Reading, likely needed to broadcast.
}
