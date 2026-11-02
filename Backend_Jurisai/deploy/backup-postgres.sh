#!/usr/bin/env bash
# Nightly Postgres backup to S3. Install on the server:
#   sudo cp deploy/backup-postgres.sh /usr/local/bin/jurisai-backup && sudo chmod +x /usr/local/bin/jurisai-backup
#   sudo crontab -e   ->   30 2 * * * BACKUP_BUCKET=s3://your-backup-bucket /usr/local/bin/jurisai-backup
# Needs the AWS CLI (sudo apt-get install -y awscli) and an EC2 IAM role allowed to write the bucket.
# The legal library can also be rebuilt with the ingest commands; backups make recovery minutes, not hours.
set -euo pipefail

: "${BACKUP_BUCKET:?set BACKUP_BUCKET=s3://bucket-name}"
DB="${PGDATABASE:-JurisAi}"
DIR=/var/backups/jurisai
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
mkdir -p "$DIR"

sudo -u postgres pg_dump -Fc "$DB" > "$DIR/$DB-$STAMP.dump"
aws s3 cp --only-show-errors "$DIR/$DB-$STAMP.dump" "$BACKUP_BUCKET/postgres/$DB-$STAMP.dump"
find "$DIR" -name '*.dump' -mtime +7 -delete   # keep a week locally; S3 lifecycle rules handle the rest
echo "backup ok: $BACKUP_BUCKET/postgres/$DB-$STAMP.dump"
