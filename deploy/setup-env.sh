#!/bin/bash
# Generate secure .env file for Happy server deployment

set -e

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    echo "WARNING: .env already exists. Creating .env.new instead."
    ENV_FILE=".env.new"
fi

echo "Generating secure credentials..."

DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
HANDY_MASTER_SECRET=$(openssl rand -hex 32)
S3_SECRET_KEY=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)

cat > "$ENV_FILE" << EOF
# Database
DB_PASSWORD=$DB_PASSWORD

# Encryption master secret
HANDY_MASTER_SECRET=$HANDY_MASTER_SECRET

# MinIO/S3 credentials
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=$S3_SECRET_KEY
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "=============================================="
echo "Created $ENV_FILE with secure credentials"
echo "=============================================="
echo ""
echo "IMPORTANT: Back up these credentials securely!"
echo ""
cat "$ENV_FILE"
echo ""
