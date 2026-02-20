FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/rider/ apps/rider/
RUN npm install -g pnpm@9.12.2 && pnpm install --frozen-lockfile
RUN pnpm --filter @kite-stack/rider build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 4002
CMD ["node", "apps/rider/dist/index.js"]
