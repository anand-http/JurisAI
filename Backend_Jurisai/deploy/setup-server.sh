#!/usr/bin/env bash
# One-time setup of the EC2 server (Debian 12 / Ubuntu 22.04+) for the JurisAI API.
# Postgres + pgvector are assumed to be installed already (they are on your server).
#
#   scp -i JurisAi.pem deploy/setup-server.sh <user>@<server>:~ && ssh -i JurisAi.pem <user>@<server> 'sudo bash setup-server.sh api.yourdomain.in'
set -euo pipefail

DOMAIN="${1:?usage: setup-server.sh <api domain, e.g. api.yourdomain.in>}"
APP_DIR=/opt/jurisai

echo "==> base packages and automatic security updates"
apt-get update
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades rsync
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Node.js 24"
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

echo "==> Caddy (reverse proxy with automatic HTTPS certificates)"
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

echo "==> app user and directory"
id jurisai >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin jurisai
mkdir -p "$APP_DIR"
chown -R jurisai:jurisai "$APP_DIR"

echo "==> Caddy site for $DOMAIN (same as deploy/Caddyfile)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	request_body {
		max_size 2MB
	}
	reverse_proxy 127.0.0.1:4000
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "==> done. Next: copy the app with deploy/push.sh, then put the production .env in $APP_DIR/.env"
