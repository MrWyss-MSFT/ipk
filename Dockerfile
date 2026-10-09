# syntax=docker/dockerfile:1

# ---- Build stage ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage -----------------------------------------------------------
# Tiny static-file server for the built assets. IPK's router is
# hash-based (#/tool/...), so no server-side rewrite/SPA fallback is actually
# required — plain static serving is enough, keeping this stage minimal.
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
