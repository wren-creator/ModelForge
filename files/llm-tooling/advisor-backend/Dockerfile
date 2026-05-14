# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install

COPY . .

# Seed the database at build time
RUN node seed.js

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Runtime libs for better-sqlite3
RUN apk add --no-cache libstdc++

# Copy installed node_modules and built app from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/advisor.db   ./advisor.db
COPY . .

EXPOSE 9001

CMD ["node", "server.js"]
