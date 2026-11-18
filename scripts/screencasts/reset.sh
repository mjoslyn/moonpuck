#!/bin/sh
# Put the local database and files back to the screencasts' demo state, so every recording starts the same.
#   sh scripts/screencasts/reset.sh          restore (stops and restarts the dev server)
#   sh scripts/screencasts/reset.sh --save   keep the current state as the demo state (after demo-setup.ts)
set -e
cd "$(dirname "$0")/../.."
npx astro dev stop >/dev/null 2>&1 || true
sleep 2
if [ "$1" = "--save" ]; then
  rm -rf .screencast-state && cp -R .wrangler/state .screencast-state
  echo "saved .wrangler/state as the demo state"
else
  [ -d .screencast-state ] || { echo "no .screencast-state: run demo-setup.ts, then reset.sh --save"; exit 1; }
  rm -rf .wrangler/state && cp -R .screencast-state .wrangler/state
  echo "restored the demo state"
fi
npx astro dev --background >/dev/null
until curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/admin/login/ | grep -q 200; do sleep 2; done
echo "dev server up"
