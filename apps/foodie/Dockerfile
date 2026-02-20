FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/foodie/ apps/foodie/
RUN npm install -g pnpm@9.12.2 && pnpm install --frozen-lockfile
RUN pnpm --filter @kite-stack/foodie build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 4003
CMD ["node", "apps/foodie/dist/index.js"]
