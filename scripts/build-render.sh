#!/bin/bash
set -e

echo "Building workspace packages..."

# Build stellar-client first (required by api)
echo "Building @jejak/stellar-client..."
pnpm --filter @jejak/stellar-client build

# Build config (required by api)
echo "Building @jejak/config..."
pnpm --filter @jejak/config build

# Build domain (required by api and risk-service)
echo "Building @jejak/domain..."
pnpm --filter @jejak/domain build

# Build api-client (generated from api)
echo "Building @jejak/api-client..."
pnpm --filter @jejak/api-client build

# Build api
echo "Building @jejak/api..."
pnpm --filter @jejak/api build

echo "✓ Build complete"
