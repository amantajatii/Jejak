FROM node:24.10.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @jejak/api...

COPY apps/api apps/api
RUN pnpm --filter @jejak/api build
RUN pnpm --filter @jejak/api deploy --prod --legacy /opt/jejak-api

FROM node:24.10.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV PARTNER_MODE=SANDBOX
WORKDIR /app

COPY --from=build --chown=node:node /opt/jejak-api ./

USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:4000/health").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
CMD ["node", "dist/server.js"]
