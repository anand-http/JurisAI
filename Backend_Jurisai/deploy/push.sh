#!/usr/bin/env bash
# Copies the code from your Mac to the server, builds it there, and restarts the API.
# Never copies .env, node_modules or local exports.
#
#   SSH_KEY=~/path/JurisAi.pem SERVER=<user>@<ec2-host> deploy/push.sh
set -euo pipefail

: "${SERVER:?set SERVER=<user>@<ec2-host>}"
SSH_KEY="${SSH_KEY:-JurisAi.pem}"
SSH="ssh -i $SSH_KEY -o ServerAliveInterval=60"
cd "$(dirname "$0")/.."

echo "==> syncing code to $SERVER:/tmp/jurisai-release"
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude dist --exclude .env --exclude '.env.*' --exclude .dev-exports --exclude coverage --exclude .git \
  ./ "$SERVER:/tmp/jurisai-release/"

echo "==> installing, building and restarting on the server"
$SSH "$SERVER" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
rsync -a --delete --exclude .env --exclude .dev-exports --exclude node_modules /tmp/jurisai-release/ /opt/jurisai/
chown -R jurisai:jurisai /opt/jurisai
cd /opt/jurisai
sudo -u jurisai npm ci --no-audit --no-fund
sudo -u jurisai npm run build
if [ ! -f /etc/systemd/system/jurisai-api.service ]; then
  cp deploy/jurisai-api.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable jurisai-api
fi
if [ -f /opt/jurisai/.env ]; then
  systemctl restart jurisai-api
  sleep 3
  systemctl --no-pager --lines=5 status jurisai-api
  curl -fsS http://127.0.0.1:4000/health && echo
else
  echo "!! /opt/jurisai/.env is missing: create it (see deploy/env.production.example), then: sudo systemctl restart jurisai-api"
fi
REMOTE
