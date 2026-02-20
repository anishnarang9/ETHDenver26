FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/eventbot/ apps/eventbot/
RUN npm install -g pnpm@9.12.2 && pnpm install --frozen-lockfile
RUN pnpm --filter @kite-stack/eventbot build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 4004
CMD ["node", "apps/eventbot/dist/index.js"]
