FROM node:22-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies
RUN cd server && npm install --production=false
RUN cd client && npm install

# Copy source
COPY . .

# Build client
RUN cd client && npm run build

# Expose port
EXPOSE ${PORT:-3001}

# Start server
CMD ["node", "server/index.js"]
