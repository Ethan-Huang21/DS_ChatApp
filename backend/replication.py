import docker
from time import sleep

NUM_CONTAINERS = 3
STARTING_PORT = 5001

def create_image(dockerfile_path, image_name, tag='latest'):
    """
    Build a Docker image from a Dockerfile.
    """
    print("Building image...")
    client.images.build(path=dockerfile_path, tag=f"{image_name}:{tag}", rm=True)
    print(f"Image {image_name}:{tag} built successfully.")

def create_container(image_name, port):
    """Create a new Docker container from an image."""
    container = client.containers.run(image_name, detach=True, ports={"8080": f"{port}"})
    print(f"Container {container.short_id} created")
    port_map[container.id] = port
    return container.id

def monitor_containers():
    """Monitor all containers for their health status."""
    while True:
        for container in client.containers.list(all=True):
            status = container.status
            if status != 'running':
                print(f"Container {container.short_id} is {status}. Spawning a new one...")
                image_name = container.image.tags[0]
                port = port_map.get(container.id)
                container.stop()
                container.remove()
                create_container(image_name, port)
        sleep(5)  # Check every 5 seconds

if __name__ == "__main__":
    # Example: Start monitoring with an initial container
    # client = docker.DockerClient(base_url="tcp://35.92.41.30:2375", tls=False)
    client = docker.from_env()
    port_map = {}
    create_image("./", "pocketbase", "latest")
    for port in list(range(STARTING_PORT, STARTING_PORT + NUM_CONTAINERS)):
        id = create_container("pocketbase:latest", port)

    monitor_containers()