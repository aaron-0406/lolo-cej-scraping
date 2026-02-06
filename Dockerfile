# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime - Use official Puppeteer image
FROM ghcr.io/puppeteer/puppeteer:23.11.1

# Switch to root temporarily to set up the app
USER root

WORKDIR /app

COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Give ownership to pptruser (the default user in puppeteer image)
RUN chown -R pptruser:pptruser /app

# Switch back to non-root user
USER pptruser

# Puppeteer in this image uses its bundled Chrome automatically
# No need to set PUPPETEER_EXECUTABLE_PATH

EXPOSE 4000

CMD ["node", "dist/index.js"]
