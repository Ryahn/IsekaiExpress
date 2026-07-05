# Node 20 LTS; canvas (@napi-rs) ships prebuilds
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

# @napi-rs/canvas text rendering needs a system font (slim images have none by default)
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

# Overridden in docker-compose (bot / web)
# CMD ["npm", "run", "start:bot"]
