#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build & (re)start the Leave Planner. Idempotent — run it for the first
# deploy AND for every future update (git pull → rebuild → reload).
# Touches only this project's code + its own PM2 apps. Run as root.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=/var/www/leave-planner
FRONTEND_URL=$(grep -E '^FRONTEND_URL=' "$APP_DIR/backend/.env" | cut -d= -f2-)

info() { echo -e "\033[36m▸ $*\033[0m"; }
grn()  { echo -e "\033[32m$*\033[0m"; }

cd "$APP_DIR"
info "Pulling latest code…"
git pull --ff-only

# ── Backend ───────────────────────────────────────────────────────────────────
info "Building backend…"
cd "$APP_DIR/backend"
npm ci --include=dev              # need tsc / prisma / ts-node to build
npx prisma generate
# This project's schema is managed with `db push` (not migrations). On a fresh DB
# this creates the full schema; on updates it syncs new tables/columns/indexes.
npx prisma db push --skip-generate
npm run build                     # tsc → dist/
# Seed first admin + email templates (idempotent; safe to re-run)
npx prisma db seed || true

# ── Frontend ──────────────────────────────────────────────────────────────────
info "Building frontend (API served from same origin at /api)…"
cd "$APP_DIR/frontend"
# Same-origin API path → no CORS, secure cookie works.
# JWT_SECRET (server-only) must match the backend so middleware can verify tokens.
JWT_SECRET_VAL=$(grep -E '^JWT_SECRET=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"')
{
  echo "NEXT_PUBLIC_API_URL=${FRONTEND_URL}/api"
  echo "JWT_SECRET=${JWT_SECRET_VAL}"
} > .env.production
npm ci --include=dev
npm run build

# ── PM2 ───────────────────────────────────────────────────────────────────────
info "Starting/reloading PM2 apps…"
cd "$APP_DIR"
if pm2 jlist 2>/dev/null | grep -q '"name":"leave-backend"'; then
  pm2 reload deploy/ecosystem.config.js   # zero-downtime reload on update
else
  pm2 start deploy/ecosystem.config.js     # first start
fi
pm2 save

grn ""
grn "✅ Deploy complete. PM2 status:"
pm2 ls | grep -E "leave-backend|leave-frontend" || true
echo ""
echo "Backend  → 127.0.0.1:4001   Frontend → 127.0.0.1:4003"
echo "If nginx + HTTPS are configured, the site is live at: $FRONTEND_URL"
