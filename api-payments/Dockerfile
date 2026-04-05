# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create non-root user and data directory with correct permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 && \
    mkdir -p /app/data && \
    chown -R appuser:nodejs /app

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8788/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 8788

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/server.js"]
