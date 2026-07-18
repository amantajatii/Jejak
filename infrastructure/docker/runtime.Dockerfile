FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/stellar-client/package.json packages/stellar-client/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/domain packages/domain
COPY packages/config packages/config
COPY packages/stellar-client packages/stellar-client
COPY infrastructure/migrations infrastructure/migrations
COPY contracts/soroban/deployments/testnet.json contracts/soroban/deployments/testnet.json

RUN pnpm --filter @jejak/stellar-client build && pnpm --filter @jejak/api build

USER node
CMD ["node", "apps/api/dist/server.js"]
