#!/usr/bin/env bash
set -euo pipefail

# Build image quietly and run it passing all args to container entrypoint
IMG_ID="$(docker build -q .)"
exec docker run --rm "$IMG_ID" "$@"


