#!/bin/bash
# GameHub — deploy / update helper (Raspberry Pi OS)
#
# Usage:
#   ./deploy.sh install        first deploy on a fresh Pi
#   ./deploy.sh update         git pull + rebuild + restart (service stays up during build)
#   ./deploy.sh apache_setup   configure Apache2 + certbot SSL
#   ./deploy.sh restart        recreate the container (picks up .env.production changes)
#   ./deploy.sh rebuild        rebuild from scratch (--no-cache) + restart
#   ./deploy.sh migrate        apply pending Prisma migrations in the running container
#   ./deploy.sh logs           follow live logs
#   ./deploy.sh status         container status + resource usage
#   ./deploy.sh shell          open a shell inside the container
#
# Database backup/restore is NOT handled here anymore — use the npm scripts:
#   npm run db:export   /   npm run db:import   (operate on prisma/gamehub.db, with path remap)
#   On the Pi the live DB is the Docker volume:  $APP_DIR/data/gamehub.db
#
# Config (override via env):  DOMAIN=... APP_DIR=... ./deploy.sh <cmd>
set -euo pipefail

DOMAIN="${DOMAIN:-gamehub.luishidalgoa.ddns-ip.net}"
APP_DIR="${APP_DIR:-$HOME/services/GameHub}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warning() { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Dependencies ────────────────────────────────────────────────────────────────
check_deps() {
    command -v docker >/dev/null 2>&1 || error "Docker not installed"
    docker compose version >/dev/null 2>&1 || error "Docker Compose v2 not available (need 'docker compose')"
    info "Dependencies OK"
}

# Run a compose command from the app directory.
dc() { ( cd "$APP_DIR" && docker compose "$@" ); }

require_app_dir() {
    [ -d "$APP_DIR" ] || error "App directory not found: $APP_DIR (run './deploy.sh install' first, or set APP_DIR=...)"
}

# ── First install ─────────────────────────────────────────────────────────────
install() {
    check_deps

    info "Creating app directory at $APP_DIR"
    sudo mkdir -p "$APP_DIR/data"

    # Prisma (UID 1001 inside the container) needs write access to the data volume.
    info "Setting Docker volume permissions for Next.js (UID 1001)..."
    sudo chown -R 1001:1001 "$APP_DIR/data"
    sudo chmod -R 775 "$APP_DIR/data"

    if [ ! -f "$APP_DIR/.env.production" ]; then
        warning ".env.production not found — copying template"
        cp .env.production "$APP_DIR/.env.production"
        warning "EDIT $APP_DIR/.env.production before continuing!"
        echo "  → nano $APP_DIR/.env.production"
        exit 1
    fi

    info "Copying app files..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
          --exclude='data' \
          . "$APP_DIR/"

    info "Building Docker image (this takes ~5 min on a Pi 4)..."
    dc build

    info "Starting container (waiting for healthcheck)..."
    dc up -d --wait

    info "Done! App running at https://$DOMAIN"
    info "Now configure Apache2 + certbot: ./deploy.sh apache_setup"
}

# ── Update ──────────────────────────────────────────────────────────────────────
update() {
    check_deps
    require_app_dir
    cd "$APP_DIR"

    info "Pulling latest code..."
    git pull

    # Build the new image WHILE the old container keeps serving traffic.
    info "Building new image (service stays up during build)..."
    docker compose build

    # --wait blocks until the healthcheck passes, so this only returns once the
    # new container is actually ready.
    info "Swapping to new image (brief restart)..."
    docker compose up -d --wait

    info "Update complete — service is healthy!"
    docker compose ps
}

# ── Apache2 + Certbot setup ─────────────────────────────────────────────────────
apache_setup() {
    require_app_dir

    info "Enabling Apache modules..."
    sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl

    info "Copying Apache configs (HTTP + HTTPS template)..."
    sudo cp "$APP_DIR/apache2/gamehub.conf"        /etc/apache2/sites-available/gamehub.conf
    sudo cp "$APP_DIR/apache2/gamehub-le-ssl.conf" /etc/apache2/sites-available/gamehub-le-ssl.conf

    info "Enabling sites..."
    sudo a2ensite gamehub.conf
    sudo a2ensite gamehub-le-ssl.conf
    sudo a2dissite 000-default.conf 2>/dev/null || true

    info "Testing Apache initial config..."
    sudo apache2ctl configtest

    info "Reloading Apache..."
    sudo systemctl reload apache2

    info "Obtaining/renewing SSL certificate via certbot..."
    sudo certbot --apache -d "$DOMAIN" --non-interactive --agree-tos \
        --redirect --email "admin@$DOMAIN" --keep-until-expiring || \
        warning "Certbot finished with warnings — verify status manually."

    info "Final test and restart of Apache..."
    sudo apache2ctl configtest
    sudo systemctl restart apache2
    info "Apache configured. App stable at https://$DOMAIN"
}

# ── Lifecycle helpers ────────────────────────────────────────────────────────────
restart() {
    require_app_dir
    info "Recreating container..."
    dc up -d --wait
    dc ps
}

rebuild() {
    require_app_dir
    info "Rebuilding image from scratch (--no-cache)..."
    dc build --no-cache
    dc up -d --wait
    info "Rebuild complete."
}

migrate() {
    require_app_dir
    info "Applying pending Prisma migrations in the running container..."
    dc exec gamehub node node_modules/prisma/build/index.js migrate deploy
}

logs() {
    require_app_dir
    dc logs -f --tail=50
}

status() {
    require_app_dir
    dc ps
    echo ""
    docker stats --no-stream gamehub || true
}

open_shell() {
    require_app_dir
    dc exec gamehub sh
}

# ── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-help}" in
    install)      install      ;;
    update)       update       ;;
    apache_setup) apache_setup ;;
    restart)      restart      ;;
    rebuild)      rebuild      ;;
    migrate)      migrate      ;;
    logs)         logs         ;;
    status)       status       ;;
    shell)        open_shell   ;;
    *)
        echo "Usage: $0 {install|update|apache_setup|restart|rebuild|migrate|logs|status|shell}"
        echo ""
        echo "  install      — first deploy on a fresh Pi"
        echo "  update       — git pull, rebuild and restart (service stays up during build)"
        echo "  apache_setup — configure Apache2 + certbot SSL"
        echo "  restart      — recreate the container (apply .env.production changes)"
        echo "  rebuild      — rebuild from scratch (--no-cache) and restart"
        echo "  migrate      — apply pending Prisma migrations in the running container"
        echo "  logs         — follow live logs"
        echo "  status       — container status and resource usage"
        echo "  shell        — open a shell inside the container"
        echo ""
        echo "  DB backup/restore: use 'npm run db:export' / 'npm run db:import'."
        echo "  The live DB on the Pi is the Docker volume at: $APP_DIR/data/gamehub.db"
        ;;
esac
