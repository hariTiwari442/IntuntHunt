# ─────────────────────────────────────────────────────────────────────────
# keyword-service — Dockerfile for Google Cloud Run
#
# HTTP-only service. Single-stage Node 20 image running TS via tsx.
# No database (no Prisma). Just Fastify + OpenAI client.
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-slim

WORKDIR /app

# Install dependencies (cached layer when package*.json hasn't changed)
COPY package*.json ./
RUN npm ci

# Copy the rest of the source
COPY . .

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "run", "api"]
