#!/bin/sh
# Container entrypoint. Honours $PORT (set by Render and similar hosts, default 8000).
# On Render (RENDER is set by the platform) the instance disk is ephemeral, so seed the demo artifacts on each boot.
set -e
if [ -n "$RENDER" ] || [ "$RELICX_SEED_ON_BOOT" = "1" ]; then
  relicx seed
fi
exec uvicorn relicx.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
