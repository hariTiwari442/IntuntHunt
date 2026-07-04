# ─────────────────────────────────────────────────────────────────────────
# main-backend — Dockerfile for Google Cloud Run
#
# Single-stage Node 20 image. We run TypeScript directly via tsx (no
# pre-compile step needed). Prisma client is generated during build so
# the deployed image already has the correct Linux binaries.
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-slim

# Prisma needs openssl + ca-certificates at runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (cached layer when package*.json hasn't changed)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client for the Linux runtime
RUN npx prisma generate

# Copy the rest of the source
COPY . .

# Cloud Run injects PORT via env; our env.ts reads it.
# Default to 3000 for local docker runs.
ENV PORT=8080
ENV NODE_ENV=production

# Cloud Run binds to whatever PORT it gives you
EXPOSE 8080

# tsx is a devDependency but is still installed because we ran `npm ci`
# (not `npm ci --omit=dev`). Keep it that way unless you switch to
# tsc-compile + node-run later.
CMD ["npm", "run", "start"]
