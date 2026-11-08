FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

# Drop root privileges
USER node

# Run node directly so SIGTERM/SIGINT reach the graceful shutdown handlers
CMD ["node", "index.js"]
