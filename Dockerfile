FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy node_modules and generated prisma client
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/sources ./sources
COPY --from=builder /app/package.json ./

# Set production environment
ENV NODE_ENV=production

# Expose ports
EXPOSE 3005 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx ./sources/main.ts"]
