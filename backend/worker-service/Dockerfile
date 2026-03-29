FROM node:20-alpine

# sharp needs build tools for native bindings on Alpine
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY worker.js .

# Port is set via MACHINE_PORT env var; document the expected default range
EXPOSE 4001

CMD ["node", "worker.js"]
