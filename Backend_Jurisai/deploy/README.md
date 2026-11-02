# Deploying to EC2

One server runs Postgres + pgvector (already set up), the Node API, and Caddy for HTTPS.

## Before you start
- An **Elastic IP** on the instance, and a DNS **A record** `api.yourdomain.in` → that IP.
- Security group: **22** (your IP only), **80** and **443** (everyone). Keep **5432 closed**.
- An **IAM role** on the instance that can use your S3 bucket(s) and send email with SES.

## 1. Prepare the server (once)
```bash
scp -i JurisAi.pem deploy/setup-server.sh <user>@<server>:~
ssh -i JurisAi.pem <user>@<server> 'sudo bash setup-server.sh api.yourdomain.in'
```
Installs Node 24, Caddy (automatic HTTPS), automatic security updates, and a `jurisai` service user.

## 2. Create a restricted database user for the app
On the server, `sudo -u postgres psql` (use a long random password, e.g. `openssl rand -hex 24`):
```sql
CREATE ROLE jurisai_app LOGIN PASSWORD '<long random password>';
GRANT CONNECT ON DATABASE "JurisAi" TO jurisai_app;
\c "JurisAi"
GRANT USAGE, CREATE ON SCHEMA public TO jurisai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jurisai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jurisai_app;
```

## 3. Ship the code (every release)
```bash
SSH_KEY=~/path/JurisAi.pem SERVER=<user>@<server> deploy/push.sh
```
Copies the code (never `.env`), builds on the server, installs the service, restarts it.

## 4. Production settings (once)
Create `/opt/jurisai/.env` from `deploy/env.production.example`
(`sudo -u jurisai nano /opt/jurisai/.env`, then `sudo chmod 600 /opt/jurisai/.env`), then:
```bash
sudo systemctl restart jurisai-api && curl https://api.yourdomain.in/health
```
In production the app refuses dev-only settings (hash embeddings, offline drafting, console
email), so Voyage, Anthropic, SES and S3 must be configured first.

## 5. Load the legal library on the server
```bash
cd /opt/jurisai
sudo -u jurisai npm run ingest            # dev seed (keeps any official text)
sudo -u jurisai npm run ingest:statutes   # official acts from India Code
sudo -u jurisai npm run ingest:sc -- --limit 300
```

## 6. Backups
```bash
sudo apt-get install -y awscli
sudo cp deploy/backup-postgres.sh /usr/local/bin/jurisai-backup && sudo chmod +x /usr/local/bin/jurisai-backup
sudo crontab -e    # add:  30 2 * * * BACKUP_BUCKET=s3://your-backup-bucket /usr/local/bin/jurisai-backup
```

Logs: `journalctl -u jurisai-api -f`
