# Production image for the MAINDY API (build from the repository root:
#   docker build -f apps/api/Dockerfile -t maindy-api .)
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile --filter @maindy/api... \
 && pnpm --filter @maindy/core build && pnpm --filter @maindy/api build \
 && pnpm deploy --filter @maindy/api --prod /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
RUN useradd --system --uid 10001 maindy && mkdir -p /data && chown maindy /data
USER maindy
ENV MAINDY_STORAGE_ROOT=/data API_PORT=4000 API_HOST=0.0.0.0
EXPOSE 4000
CMD ["node", "dist/main.js"]
