# MemoryFlow Production Dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native compilation tools required for node-gyp and better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install all dependencies and compile native addons
RUN npm ci

# Copy source code and build production assets
COPY . ./
RUN npm run build

# Final lean runner image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

# Copy complete built application and pre-compiled node_modules from builder
COPY --from=builder /app ./

EXPOSE 5173

# Start Vite production preview server with mounted Express API
CMD ["npm", "run", "preview"]
