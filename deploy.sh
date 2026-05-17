#!/bin/bash
# GameHub — deploy / update script
# Usage:
#   First deploy:  ./deploy.sh install
#   Update:        ./deploy.sh update

set -e
DOMAIN="gamehub.luishidalgoa.ddns-ip.net"
APP_DIR="/home/luish/services/GameHub"

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
    info "Now configure Apache2 + certbot: ./deploy.sh apache_setup"
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

# ── Apache2 + Certbot setup ───────────────────────────────────────────────────
apache_setup() {
    # Enable required Apache modules
    info "Enabling Apache modules..."
    sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl

    info "Copying Apache configs (HTTP + HTTPS template)..."
    sudo cp "$APP_DIR/apache2/gamehub.conf" /etc/apache2/sites-available/gamehub.conf
    sudo cp "$APP_DIR/apache2/gamehub-le-ssl.conf" /etc/apache2/sites-available/gamehub-le-ssl.conf

    info "Enabling sites..."
    sudo a2ensite gamehub.conf
    sudo a2ensite gamehub-le-ssl.conf

    # Disable default site if present
    sudo a2dissite 000-default.conf 2>/dev/null || true

    info "Testing Apache initial config..."
    sudo apache2ctl configtest

    info "Reloading Apache to apply templates..."
    sudo systemctl reload apache2

    info "Obtaining/Renewing SSL certificate via certbot..."
    # --keep-until-expiring evita que certbot duplique o sobreescriba configuraciones si el certificado ya es válido
    sudo certbot --apache -d "$DOMAIN" --non-interactive --agree-tos \
        --redirect --email "admin@luishidalgoa.ddns-ip.net" --keep-until-expiring || \
        warning "Certbot task finished — verify status manually."

    info "Final test and restart of Apache..."
    sudo apache2ctl configtest
    sudo systemctl restart apache2
    info "Apache fully configured. App stable at https://$DOMAIN"
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
    install)      install      ;;
    update)       update       ;;
    apache_setup) apache_setup ;;
    logs)         logs         ;;
    status)       status       ;;
    *)
        echo "Usage: $0 {install|update|apache_setup|logs|status}"
        echo ""
        echo "  install       — first deploy on a fresh Pi"
        echo "  update        — rebuild and restart after a git pull"
        echo "  apache_setup  — configure Apache2 + certbot SSL"
        echo "  logs          — follow live logs"
        echo "  status        — container status and resource usage"
        ;;
esac
