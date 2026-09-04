# ---------- dependencies ----------
FROM node:22-alpine AS deps
# Prisma's query engine is linked against OpenSSL.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
# The schema has to be present: postinstall runs `prisma generate`.
COPY prisma ./prisma
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` regenerates the Prisma client, then builds Next in standalone mode.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- seeder ----------
# Keeps devDependencies and the TypeScript sources so the mock data can be
# loaded from a container: `docker compose run --rm seed`.
FROM node:22-alpine AS seeder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=builder /app/src/generated ./src/generated
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed"]

# ---------- runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT; 8080 is its default.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
