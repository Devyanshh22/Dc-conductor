# node:22-alpine — required for the built-in node:sqlite module (Node 22.5+)
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Copy all backend source (excludes worker-service via .dockerignore)
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
