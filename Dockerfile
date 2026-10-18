# Self-hosted ProfitDeck. Expects DATABASE_URL to point at Postgres (see docker-compose.yml).
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json prisma/schema.prisma ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npx next build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/public ./public
EXPOSE 3000
# Create/upgrade the schema on every start, then serve.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -p ${PORT}"]
