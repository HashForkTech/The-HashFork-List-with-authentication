# ---- deps ---------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm ci

# ---- build --------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ------------------------------------------------------------
# The build emits a self-contained server bundle in .next/standalone
# (next.config.mjs → output: 'standalone'). It is started directly with
# `node server.js`: `next start` does NOT work with a standalone build.
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

# The SQLite database MUST live on a persistent volume mounted at /data.
VOLUME ["/data"]

# Self-contained bundle: server.js + its own minimal node_modules.
COPY --from=build /app/.next/standalone ./
# ...but the standalone output ships WITHOUT assets — copy them in,
# otherwise every stylesheet/script request returns 404.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
