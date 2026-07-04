# ─────────────────────────────────────────────────────────────────────────
# crawler-service — Dockerfile for Google Cloud Run
#
# Single image used for BOTH the API and the worker. The CMD is overridden
# at deploy time via Cloud Run's container command setting:
#   - API service:    npm run api
#   - Worker service: npm run worker
#
# Both share the same base image — no rebuild needed when switching.
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-slim

# Prisma + Node native deps need openssl
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (cached layer)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client for Linux runtime
RUN npx prisma generate

# Copy the rest of the source
COPY . .

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Default to API — override with `--command` or Cloud Run "Container command" UI
# for the worker deployment.
CMD ["npm", "run", "api"]
