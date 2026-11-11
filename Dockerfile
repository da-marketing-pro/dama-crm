# 1. Base stage
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# 2. Dependencies stage
FROM base AS deps
COPY package.json package-lock.json* ./
# Всегда устанавливаем devDependencies (typescript, tailwindcss и др.),
# даже если сервер/Coolify передает NODE_ENV=production при сборке
RUN npm ci --include=dev

# 3. Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Проверка целостности структуры перед сборкой
RUN test -f tsconfig.json && test -d src/lib && test -d src/modules

# Generate Prisma client
RUN npx prisma generate

# Build standalone Next.js bundle
RUN npm run build

# 4. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install prisma & tsx globally matching lockfile versions
RUN npm install -g prisma@5.22.0 tsx@4.23.15

# Create secure system user with home directory for prisma/npm cache
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 -h /home/nextjs nextjs

# Copy Prisma schema and package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Copy standalone server and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy dependencies needed by prisma/prod-init.ts (not traced directly into standalone node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
