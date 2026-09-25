# syntax=docker/dockerfile:1

# ---- build stage: install all dependencies and compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- test stage: run the automated suite (unit + API + Postgres integration) ----
FROM build AS test
COPY vitest.config.ts ./
COPY test ./test
CMD ["npm", "run", "test"]

# ---- runtime stage: production dependencies only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
