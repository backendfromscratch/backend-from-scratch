# La imagen de la API de la tienda (Fase 7, lección 3). Constrúyela con:
#   docker build -t tienda-api .

# La imagen de partida: Debian con Node 26, en su versión slim (node:26-slim). Fijada por su
# digest, que no cambia nunca: la etiqueta 26-slim, en cambio, pasa a otra imagen con cada versión.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0

# La carpeta de trabajo dentro de la imagen: las instrucciones siguientes se ejecutan en ella.
WORKDIR /app

# Primero, solo lo que necesita npm ci: así, cambiar el código no repite la instalación (la caché).
# .npmrc también: sin él, npm ci ejecutaría los scripts de instalación de los paquetes, que .npmrc
# apaga (ignore-scripts=true).
COPY package.json package-lock.json .npmrc ./

# Instala exactamente las versiones de package-lock.json.
RUN npm ci

# El resto del proyecto, menos lo que dice .dockerignore.
COPY . .

# Dentro del contenedor, el servidor escucha en todas sus direcciones (src/config.ts).
ENV HOST=0.0.0.0

# Documenta el puerto en el que escucha. No lo publica: eso lo hace docker run -p.
EXPOSE 3000

# El programa que arranca el contenedor, en forma exec (una lista): node es el proceso 1 y recibe
# las señales de docker stop y de Ctrl + C.
CMD ["node", "src/servidor.ts"]
