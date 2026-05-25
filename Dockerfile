# Stage 1: Build the Nuxt application
FROM node:20-slim AS builder
WORKDIR /app

# Copy package descriptors and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code and compile production bundle
COPY . .
RUN npm run build

# Stage 2: Runtime image
FROM node:20-slim AS runner
WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy compiled Nitro server output and package descriptors
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Expose server port
EXPOSE 3000

# Start Nuxt production server
CMD ["node", ".output/server/index.mjs"]
