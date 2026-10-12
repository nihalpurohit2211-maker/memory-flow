# MemoryFlow Production Dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

# Copy package manifests
COPY package*.json ./

# Install dependencies (Node 22 on Debian provides official prebuilt glibc binaries for better-sqlite3)
RUN npm ci

# Copy application source
COPY . ./

# Build production bundle
RUN npm run build

# Expose default port
EXPOSE 5173

# Start Vite production preview server with mounted Express API
CMD ["npm", "run", "preview"]
