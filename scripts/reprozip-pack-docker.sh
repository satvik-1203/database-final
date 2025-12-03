#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/reprozip-pack-docker.sh tests/input99.txt
# Produces: simulator.rpz in project root

INPUT_FILE="${1:-}"
if [[ -z "${INPUT_FILE}" ]]; then
  echo "Usage: $0 <input-file>"
  exit 1
fi

if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "Input file not found: ${INPUT_FILE}"
  exit 1
fi

# Build the packer image (includes reprozip + node + pnpm)
# Force x86_64 on Apple Silicon to avoid reprozip arch build issues
docker build --platform=linux/amd64 -f Dockerfile.reprozip -t dtsim-reprozip .

# Trace and pack inside container; need ptrace capability
docker run --rm --platform=linux/amd64 \
  -e CI=true \
  --cap-add=SYS_PTRACE --security-opt seccomp=unconfined \
  -v "$(pwd)":/app -w /app \
  dtsim-reprozip bash -lc "\
    npm install && \
    npm run build && \
    rm -rf .reprozip-trace .reprozip-trace* && \
    UV_USE_IO_URING=0 reprozip trace --overwrite node dist/index.js ${INPUT_FILE} && \
    reprozip pack /app/simulator.rpz \
  "

echo "✓ Created simulator.rpz"


