## Replication Microservice
This microservice is responsible for creating and monitoring pocketbase docker containers. To run the microservice, run 
```
python replication.py
```
This will build a docker image from the Dockerfile, then create 3 containers running pocketbase, then monitor the liveness of containers.

You can try to kill one of the containers by
```
docker stop <container_id>
```
and the microservice should spawn a new container