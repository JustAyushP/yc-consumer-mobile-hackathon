#!/usr/bin/env bash
# Creates a 3-detective demo group through the internal engine (what Comms will do from messages)
# and prints one viewer link per detective. Usage: scripts/demo-setup.sh [web-base-url]
set -euo pipefail
BASE="${1:-http://localhost:8081}"
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[process.argv[1]]))' "$1"; }
npx convex run cases/seed:seed >/dev/null
OUT=$(npx convex run game/groups:create '{"groupName":"The Night Shift","playerName":"Ada"}')
CODE=$(echo "$OUT" | field joinCode)
PLAYERS=("$(echo "$OUT" | field playerId)")
for NAME in Bo Cy; do PLAYERS+=("$(npx convex run game/groups:join "{\"code\":\"$CODE\",\"playerName\":\"$NAME\"}" | field playerId)"); done
I=0
for P in "${PLAYERS[@]}"; do
  npx convex run game/survey:submit "{\"playerId\":\"$P\",\"answers\":[{\"questionKey\":\"first_look\",\"optionIndex\":$I},{\"questionKey\":\"friends_say\",\"optionIndex\":$I},{\"questionKey\":\"tool\",\"optionIndex\":$I},{\"questionKey\":\"pressure\",\"optionIndex\":$I}]}" >/dev/null
  I=$((I + 1))
done
npx convex run game/groups:start "{\"playerId\":\"${PLAYERS[0]}\"}" >/dev/null
echo "Join code: $CODE"
for P in "${PLAYERS[@]}"; do
  echo "$BASE/?t=$(npx convex run game/viewer:mintToken "{\"playerId\":\"$P\"}" | field token)"
done
