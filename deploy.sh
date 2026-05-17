#!/bin/bash
# GameHub — deploy / update script
# Usage:
#   First deploy:  ./deploy.sh install
#   Update:        ./deploy.sh update

set -e
DOMAIN="YOUR_DOMAIN.com"
APP_DIR="/opt/gamehub"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warning() { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Check dependencies ────────────────────────────────────────────────────────
check_deps() {
    command -v docker          >/dev/null 2>&1 || error "Docker not installed"
    command -v docker compose  >/dev/null 2>&1 || error "Docker Compose v2 not installed"
    info "Dependencies OK"
}

# ── First install ─────────────────────────────────────────────────────────────
install() {
    check_deps

    info "Creating app directory at $APP_DIR"
    sudo mkdir -p "$APP_DIR"/{data,public/covers}
    sudo chown -R "$USER":"$USER" "$APP_DIR"

    if [ ! -f "$APP_DIR/.env.production" ]; then
        warning ".env.production not found — copying template"
        cp .env.production "$APP_DIR/.env.production"
        warning "EDIT $APP_DIR/.env.production before continuing!"
        echo "  → nano $APP_DIR/.env.production"
        exit 1
    fi

    info "Copying app files..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
          --exclude='data' --exclude='public/covers' \
          . "$APP_DIR/"

    cd "$APP_DIR"
    info "Building Docker image (this takes ~5 min on Pi 4)..."
    docker compose build

    info "Starting container..."
    docker compose up -d

    info "Waiting for app to start..."
    sleep 5
    docker compose logs --tail=20

    info "Done! App running at http://localhost:3000"
    info "Now configure nginx + certbot (see deploy.sh nginx_setup)"
}

# ── Update ────────────────────────────────────────────────────────────────────
update() {
    check_deps
    cd "$APP_DIR"

    info "Pulling latest code..."
    git pull

    info "Rebuilding image..."
    docker compose build

    info "Restarting container..."
    docker compose up -d

    info "Update complete!"
    docker compose ps
}

# ── Nginx + Certbot setup ─────────────────────────────────────────────────────
nginx_setup() {
    command -v nginx  >/dev/null 2>&1 || sudo apt-get install -y nginx
    command -v certbot >/dev/null 2>&1 || sudo apt-get install -y certbot python3-certbot-nginx

    info "Copying nginx config..."
    sudo cp "$APP_DIR/nginx/gamehub.conf" /etc/nginx/sites-available/gamehub.conf
    sudo sed -i "s/YOUR_DOMAIN.com/$DOMAIN/g" /etc/nginx/sites-available/gamehub.conf
    sudo ln -sf /etc/nginx/sites-available/gamehub.conf /etc/nginx/sites-enabled/gamehub.conf

    # Disable default site if present
    sudo rm -f /etc/nginx/sites-enabled/default

    info "Testing nginx config..."
    sudo nginx -t

    info "Obtaining SSL certificate..."
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --redirect --email "admin@$DOMAIN" || \
    warning "Certbot failed — run manually: sudo certbot --nginx -d $DOMAIN"

    sudo systemctl reload nginx
    info "Nginx configured. App available at https://$DOMAIN"
}

# ── Logs ─────────────────────────────────────────────────────────────────────
logs() {
    cd "$APP_DIR"
    docker compose logs -f --tail=50
}

# ── Status ────────────────────────────────────────────────────────────────────
status() {
    cd "$APP_DIR"
    docker compose ps
    echo ""
    docker stats --no-stream gamehub
}

# ── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-help}" in
    install)     install     ;;
    update)      update      ;;
    nginx_setup) nginx_setup ;;
    logs)        logs        ;;
    status)      status      ;;
    *)
        echo "Usage: $0 {install|update|nginx_setup|logs|status}"
        echo ""
        echo "  install      — first deploy on a fresh Pi"
        echo "  update       — rebuild and restart after a git pull"
        echo "  nginx_setup  — configure nginx + certbot SSL"
        echo "  logs         — follow live logs"
        echo "  status       — container status and resource usage"
        ;;
esac
