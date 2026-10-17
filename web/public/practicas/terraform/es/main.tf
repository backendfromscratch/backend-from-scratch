# Práctica de la lección «Terraform: infraestructura como código desde cero».
# Describe un contenedor de nginx con una página tuya. Terraform lo crea, lo cambia y lo borra.
# Un archivo .tf es una descripción de cómo quieres que sea la infraestructura, no una lista
# de órdenes: Terraform compara lo que describes con lo que existe y hace solo lo que falta.

terraform {
  required_providers {
    # Un proveedor es el plugin que sabe hablar con un servicio. Este habla con Docker.
    # Fijamos la versión exacta, como el curso fija todo lo demás.
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

# Sin más datos, el proveedor usa el Docker de tu ordenador (el socket /var/run/docker.sock).
provider "docker" {}

# Una variable es un dato que cambias sin tocar el resto del código.
variable "texto_pagina" {
  description = "El texto de la página que sirve nginx"
  type        = string
  default     = "Hola desde Terraform"
}

# La imagen de nginx, fijada por su versión y por su huella (digest): siempre la misma imagen.
resource "docker_image" "nginx" {
  name         = "nginx:1.29.8@sha256:1881968aff6f7cdcc4b888c00a11f4ce241ad7ec957e0cb4a9e19e93a3ff87ea"
  keep_locally = true # al destruir, deja la imagen descargada en tu ordenador
}

# El contenedor. Lo publicamos solo en 127.0.0.1: únicamente tu ordenador llega a él.
resource "docker_container" "web" {
  name  = "practica-terraform"
  image = docker_image.nginx.image_id # así Terraform sabe que primero va la imagen

  ports {
    internal = 80
    external = 8081
    ip       = "127.0.0.1"
  }

  # Crea dentro del contenedor la página de inicio con el texto de la variable.
  upload {
    file    = "/usr/share/nginx/html/index.html"
    content = "<h1>${var.texto_pagina}</h1>\n"
  }
}

# Una salida es un dato que Terraform te muestra al terminar.
output "url" {
  description = "Dónde ver la página"
  value       = "http://127.0.0.1:8081"
}
