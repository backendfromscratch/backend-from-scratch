# Practice for the lesson "Terraform: infrastructure as code from scratch".
# It describes an nginx container with a page of your own. Terraform creates, changes and deletes it.
# A .tf file describes how you want the infrastructure to be, not a list of commands:
# Terraform compares what you describe with what exists and does only what is missing.

terraform {
  required_providers {
    # A provider is the plugin that knows how to talk to a service. This one talks to Docker.
    # We pin the exact version, like the course pins everything else.
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

# With no other data, the provider uses your computer's Docker (the /var/run/docker.sock socket).
provider "docker" {}

# A variable is a value you change without touching the rest of the code.
variable "page_text" {
  description = "The text of the page nginx serves"
  type        = string
  default     = "Hello from Terraform"
}

# The nginx image, pinned by its version and its digest: always the very same image.
resource "docker_image" "nginx" {
  name         = "nginx:1.29.8@sha256:1881968aff6f7cdcc4b888c00a11f4ce241ad7ec957e0cb4a9e19e93a3ff87ea"
  keep_locally = true # on destroy, leave the image downloaded on your computer
}

# The container. We publish it on 127.0.0.1 only: just your computer can reach it.
resource "docker_container" "web" {
  name  = "terraform-practice"
  image = docker_image.nginx.image_id # this is how Terraform knows the image comes first

  ports {
    internal = 80
    external = 8081
    ip       = "127.0.0.1"
  }

  # Creates the home page inside the container with the variable's text.
  upload {
    file    = "/usr/share/nginx/html/index.html"
    content = "<h1>${var.page_text}</h1>\n"
  }
}

# An output is a value Terraform shows you when it finishes.
output "url" {
  description = "Where to see the page"
  value       = "http://127.0.0.1:8081"
}
