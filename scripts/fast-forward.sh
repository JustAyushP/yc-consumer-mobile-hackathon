#!/usr/bin/env bash
# Demo control: advance a group to its next day (marks missed days, opens the next day's clues).
# Usage: scripts/fast-forward.sh <JOIN_CODE>
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <JOIN_CODE>" >&2; exit 1; }
npx convex run game/engine:fastForwardByCode "{\"joinCode\":\"$1\"}"
