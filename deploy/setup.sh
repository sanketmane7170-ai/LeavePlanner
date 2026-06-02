#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ONE-TIME setup for the Leave Planner (project #2).
# Safe to run on a server already hosting project #1:
#   • Aborts if ports 4001/4003 are already in use.
#   • Aborts if the database or DB user already exists (won't clobber).
#   • Never touches existing nginx files, PM2 apps, or databases.
# Run as root.  Usage:  bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=/var/www/leave-planner
REPO=https://github.com/sanketmane7170-ai/LeavePlanner.git
DB_NAME=innovizia_leave_planner
DB_USER=leaveplanner
BACKEND_PORT=4001
FRONTEND_PORT=4003

red()  { echo -e "\033[31m$*\033[0m"; }
grn()  { echo -e "\033[32m$*\033[0m"; }
info() { echo -e "\033[36m▸ $*\033[0m"; }

info "Pre-flight checks (read-only)…"

# 1. Ports free?
for p in $BACKEND_PORT $FRONTEND_PORT; do
  if ss -tlnp 2>/dev/null | grep -q ":$p "; then
    red "ABORT: port $p is already in use. Edit the *_PORT vars and retry."
    exit 1
  fi
done
grn "  ports $BACKEND_PORT / $FRONTEND_PORT are free"

# 2. PM2 names free?
if command -v pm2 >/dev/null 2>&1; then
  if pm2 jlist 2>/dev/null | grep -q '"name":"leave-backend"\|"name":"leave-frontend"'; then
    red "ABORT: a 'leave-backend'/'leave-frontend' PM2 app already exists."
    exit 1
  fi
fi
grn "  PM2 names available"

# 3. Database / user must NOT already exist
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  red "ABORT: database '$DB_NAME' already exists. Refusing to clobber."
  exit 1
fi
grn "  database name '$DB_NAME' is available"

# ── Dependencies (install only if missing — never downgrade project #1) ───────
info "Ensuring Node 20, PM2, nginx, postgres client are present…"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pm2   >/dev/null 2>&1 || npm install -g pm2
command -v nginx >/dev/null 2>&1 || apt-get install -y nginx
command -v psql  >/dev/null 2>&1 || apt-get install -y postgresql-client

# ── Create isolated database + user ───────────────────────────────────────────
info "Creating isolated database '$DB_NAME' and user '$DB_USER'…"
DB_PASS=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")
sudo -u postgres psql <<SQL
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL
grn "  database created"

# ── Clone repo ────────────────────────────────────────────────────────────────
info "Cloning repo to $APP_DIR…"
mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  red "ABORT: $APP_DIR already contains a git repo."
  exit 1
fi
git clone "$REPO" "$APP_DIR"

# ── Log dir ───────────────────────────────────────────────────────────────────
mkdir -p /var/log/leave-planner

# ── Backend .env ──────────────────────────────────────────────────────────────
info "Writing backend .env (review and complete it before deploy)…"
JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
cp "$APP_DIR/deploy/.env.production.example" "$APP_DIR/backend/.env"
sed -i "s#CHANGE_THIS_DB_PASSWORD#$DB_PASS#" "$APP_DIR/backend/.env"
sed -i "s#CHANGE_THIS_TO_A_64_BYTE_RANDOM_HEX#$JWT#" "$APP_DIR/backend/.env"

grn ""
grn "✅ Setup complete."
echo "   DB user:     $DB_USER"
echo "   DB password: $DB_PASS   (already written into backend/.env)"
echo "   JWT secret:  generated and written into backend/.env"
echo ""
echo "NEXT:"
echo "  1. Edit $APP_DIR/backend/.env — set FRONTEND_URL, ADMIN_*, SMTP_*."
echo "  2. Run:  bash $APP_DIR/deploy/deploy.sh"
echo "  3. Configure nginx + HTTPS (see deploy/README.md)."
