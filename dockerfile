# Node 20 LTS; canvas (@napi-rs) ships prebuilds
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

# Overridden in docker-compose (bot / web)
# CMD ["npm", "run", "start:bot"]
