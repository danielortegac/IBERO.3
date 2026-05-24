# Goatify IA - Cloud Run production image
# Multi-stage build: instala todo para compilar, pero ejecuta solo con deps de producción.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/manifest.json ./manifest.json
COPY --from=build /app/sw.js ./sw.js
COPY --from=build /app/metadata.json ./metadata.json
EXPOSE 8080
CMD ["node", "dist-server/server.js"]
