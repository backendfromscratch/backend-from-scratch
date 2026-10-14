# The image of the shop's API (Phase 7, lesson 3). Build it with:
#   docker build -t shop-api .

# The starting image: Debian with Node 26, in its slim version (node:26-slim). Pinned by its
# digest, which never changes: the 26-slim tag, on the other hand, moves to another image with each
# version.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0

# The working folder inside the image: the following instructions run in it.
WORKDIR /app

# First, only what npm ci needs: this way, changing the code doesn't repeat the install (the cache).
# .npmrc too: without it, npm ci would run the packages' install scripts, which .npmrc turns off
# (ignore-scripts=true).
COPY package.json package-lock.json .npmrc ./

# Installs exactly the versions in package-lock.json.
RUN npm ci

# The rest of the project, except what .dockerignore says.
COPY . .

# Inside the container, the server listens on all its addresses (src/config.ts).
ENV HOST=0.0.0.0

# Documents the port it listens on. It doesn't publish it: docker run -p does that.
EXPOSE 3000

# The program the container starts, in exec form (a list): node is process 1 and receives the
# signals from docker stop and from Ctrl + C.
CMD ["node", "src/server.ts"]
