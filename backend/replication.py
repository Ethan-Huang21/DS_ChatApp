import docker
import logging
from time import sleep
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NUM_CONTAINERS = int(os.getenv('NUM_CONTAINERS', 3))
STARTING_PORT = int(os.getenv('STARTING_PORT', 5001))
NETWORK_NAME = "pocketbase_network"

# Define server_list with container names
server_list = [f"pocketbase_{index+1}" for index in range(NUM_CONTAINERS)]

def remove_network(network_name):
    """Remove an existing Docker network."""
    try:
        logger.info(f"Removing network {network_name}...")
        network = client.networks.get(network_name)
        network.remove()
        logger.info(f"Network {network_name} removed successfully.")
    except docker.errors.NotFound:
        logger.info(f"Network {network_name} does not exist.")
    except docker.errors.APIError as e:
        logger.error(f"Failed to remove network {network_name}. Error: {e}")

def create_network(network_name):
    """Create a custom Docker network."""
    try:
        logger.info(f"Creating network {network_name}...")
        client.networks.create(network_name, driver="bridge")
        logger.info(f"Network {network_name} created successfully.")
    except docker.errors.APIError as e:
        logger.error(f"Failed to create network {network_name}. Error: {e}")

def create_image(dockerfile_path, image_name, tag='latest'):
    """
    Build a Docker image from a Dockerfile.
    """
    try:
        logger.info("Building image...")
        client.images.build(path=dockerfile_path, tag=f"{image_name}:{tag}", rm=True)
        logger.info(f"Image {image_name}:{tag} built successfully.")
    except docker.errors.BuildError as e:
        logger.error(f"Failed to build image {image_name}:{tag}. Error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")

def create_container(image_name, host_port, container_name):
    """Create a new Docker container from an image."""
    try:
        container = client.containers.run(
            image_name,
            name=container_name,
            detach=True,
            ports={"8080": host_port},
            network=NETWORK_NAME,
            environment={"SERVER_LIST": server_list}  # Pass SERVER_LIST environment variable
        )
        logger.info(f"Container {container.short_id} ({container_name}) created on port {host_port}")
        port_map[container.id] = host_port
        return container.id
    except docker.errors.ContainerError as e:
        logger.error(f"Failed to create container from image {image_name}. Error: {e}")
    except docker.errors.ImageNotFound as e:
        logger.error(f"Image {image_name} not found. Error: {e}")
    except docker.errors.APIError as e:
        logger.error(f"API error occurred: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")

def get_container_ip(container_name):
    """Get the IP address of a container."""
    try:
        container = client.containers.get(container_name)
        network_settings = container.attrs['NetworkSettings']['Networks'][NETWORK_NAME]
        return network_settings['IPAddress']
    except docker.errors.NotFound as e:
        logger.error(f"Container {container_name} not found. Error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
    return None

def monitor_containers():
    """Monitor all containers for their health status."""
    try:
        while True:
            for container in client.containers.list(all=True):
                status = container.status
                if status != 'running':
                    logger.warning(f"Container {container.short_id} is {status}. Spawning a new one...")
                    image_name = container.image.tags[0]
                    host_port = port_map.get(container.id)
                    container_name = container.name
                    try:
                        container.stop()
                        container.remove()
                    except Exception as e:
                        logger.error(f"Error stopping/removing container {container.short_id}: {e}")
                    create_container(image_name, host_port, container_name)
            sleep(5)  # Check every 5 seconds
    except KeyboardInterrupt:
        logger.info("Monitoring stopped.")
    except Exception as e:
        logger.error(f"Unexpected error in monitoring: {e}")

if __name__ == "__main__":
    client = docker.from_env()
    port_map = {}
    
    # Remove existing Docker network
    remove_network(NETWORK_NAME)

    # Create Docker network
    create_network(NETWORK_NAME)
    
    # Create Docker image
    create_image("./", "pocketbase", "latest")
    
    # Create initial containers
    for index, host_port in enumerate(range(STARTING_PORT, STARTING_PORT + NUM_CONTAINERS)):
        container_name = f"pocketbase_{index+1}"
        create_container("pocketbase:latest", host_port, container_name)
    
    # Print container IP addresses
    container_ips = []
    for index in range(NUM_CONTAINERS):
        container_name = f"pocketbase_{index+1}"
        ip_address = get_container_ip(container_name)
        if ip_address:
            container_ips.append(ip_address)
            logger.info(f"Container {container_name} has IP address {ip_address}")

    # Format the IP addresses with mapped host ports for use in the load balancer
    pocketbase_urls = [f"http://localhost:{port}" for port in range(STARTING_PORT, STARTING_PORT + NUM_CONTAINERS)]
    # Convert the list of Pocketbase URLs to a comma-separated string
    pocketbase_urls_string = ",".join(pocketbase_urls)
    # print(pocketbase_urls_string)

    # Write the Pocketbase URLs string to a file
    with open("balancer/pocketbase_urls.txt", "w") as file:
        file.write(pocketbase_urls_string)

    # Start monitoring
    monitor_containers()