# ── Stage 1: Build ─────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN node seed.js


# ── Stage 2: Runtime ───────────────────────────────────────
FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=builder /app ./

EXPOSE 9001
CMD ["node", "server.js"]
