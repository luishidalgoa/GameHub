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
    # check_deps # Descoméntalo si tienes la función definida arriba

    info "Creating app directory at $APP_DIR"
    sudo mkdir -p "$APP_DIR/data"

    # Prisma (UID 1001 inside the container) needs write access to the data volume.
    info "Setting up Docker volume permissions for Next.js (UID 1001)..."
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

    cd "$APP_DIR"
    info "Building Docker image (this takes ~5 min on Pi 4)..."
    docker compose build

    info "Starting container (waiting for healthcheck)..."
    docker compose up -d --wait

    info "Done! App running at https://$DOMAIN"
    info "Now configure Apache2 + certbot: ./deploy.sh apache_setup"
}

# ── Update ────────────────────────────────────────────────────────────────────
update() {
    check_deps
    cd "$APP_DIR"

    info "Pulling latest code..."
    git pull

    # Build the new image WHILE the old container keeps serving traffic.
    info "Building new image (service stays up during build)..."
    docker compose build

    # Swap to the new image. --wait blocks until the healthcheck passes,
    # so this command only returns once the new container is actually ready.
    info "Swapping to new image (brief restart)..."
    docker compose up -d --wait

    info "Update complete — service is healthy!"
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

# ── Database Import / Export ──────────────────────────────────────────────────
db_export() {
    local backup_name="gamehub_backup_$(date +%F_%H%M%S).db"
    info "Exporting database..."
    
    if [ ! -f "$APP_DIR/data/gamehub.db" ]; then
        error "No active database found at $APP_DIR/data/gamehub.db to export."
    fi

    # Copiamos la base de datos a la carpeta actual desde la que ejecutas el script
    cp "$APP_DIR/data/gamehub.db" "./$backup_name"
    # Le devolvemos el propietario al usuario que lanza el script para que puedas moverlo por FTP/Samba fácilmente
    sudo chown "$USER":"$USER" "./$backup_name"
    
    info "Database exported successfully to current directory as: $backup_name"
}

db_import() {
    info "Preparing database import..."
    
    # Buscamos si hay algún archivo .db en la carpeta actual para importar
    local available_dbs=( *.db )
    
    if [ ! -e "${available_dbs[0]}" ]; then
        error "No file ending in .db found in the current directory. Place your Windows 'gamehub.db' here first."
    fi

    echo "Available databases in this directory:"
    select file in "${available_dbs[@]}"; do
        if [ -n "$file" ]; then
            info "Selected file for import: $file"
            
            # Si el contenedor está corriendo, lo paramos para no corromper SQLite en caliente
            info "Stopping gamehub container to safely replace database..."
            cd "$APP_DIR" && docker compose stop gamehub || true
            
            # Hacemos un backup rápido de la que ya haya en la Pi por si acaso
            if [ -f "$APP_DIR/data/gamehub.db" ]; then
                mv "$APP_DIR/data/gamehub.db" "$APP_DIR/data/gamehub.db.bak"
            fi
            
            # Copiamos el nuevo archivo a su destino definitivo
            sudo cp "$APP_DIR/$file" "$APP_DIR/data/gamehub.db"
            
            # Re-aplicamos los permisos del UID 1001 imprescindibles para Prisma
            sudo chown -R 1001:1001 "$APP_DIR/data"
            sudo chmod -R 775 "$APP_DIR/data"
            
            # Volvemos a levantar el contenedor
            info "Starting container back up..."
            docker compose start gamehub
            
            info "Database successfully imported and permissions fixed!"
            break
        else
            warning "Invalid selection."
        fi
    done
}

# ── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-help}" in
    install)      install      ;;
    update)       update       ;;
    apache_setup) apache_setup ;;
    db_export)    db_export    ;;
    db_import)    db_import    ;;
    logs)         logs         ;;
    status)       status       ;;
    *)
        echo "Usage: $0 {install|update|apache_setup|db_export|db_import|logs|status}"
        echo ""
        echo "  install      — first deploy on a fresh Pi"
        echo "  update       — rebuild and restart after a git pull"
        echo "  apache_setup — configure Apache2 + certbot SSL"
        echo "  db_export    — backup and export current SQLite database"
        echo "  db_import    — import a local database file (.db) with auto-permissions"
        echo "  logs         — follow live logs"
        echo "  status       — container status and resource usage"
        ;;
esac
