# Deployment Guide 🚀

Complete guide to deploy GameHub to production.

## Deployment Options

Choose based on your needs:

1. **Vercel** - Easiest, free tier available
2. **Docker** - Most flexible, run anywhere
3. **VPS/Dedicated Server** - Full control, cheaper long-term
4. **NAS** - Perfect for home labs
5. **Cloud Platforms** - AWS, Azure, DigitalOcean, Heroku

---

## Option 1: Vercel (Easiest)

Vercel is the easiest way to deploy Next.js apps.

### Prerequisites

- GitHub account
- Vercel account (free)
- GitHub repository

### Steps

1. **Connect GitHub to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Connect your GitHub account
   - Select GameHub repository

2. **Configure Environment Variables**
   - In Vercel dashboard → Settings → Environment Variables
   - Add:
     ```
     DATABASE_URL="file:./gamehub.db"
     ADMIN_PASSWORD="your_password"
     NEXT_PUBLIC_APP_URL="https://yourdomain.com"
     RAWG_API_KEY="your_api_key"
     ```

3. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your site is live!

4. **Custom Domain** (optional)
   - Go to Settings → Domains
   - Add your domain
   - Update DNS records as instructed

### Pros
- ✅ Automatic deployments from GitHub
- ✅ Free tier available
- ✅ Global CDN
- ✅ Simple scaling

### Cons
- ❌ SQLite database resets on redeploy (use external DB)
- ❌ Limited to 10 seconds per serverless function
- ❌ Expensive for large files

### Database Note

Vercel's serverless environment is stateless. Consider:

1. **PostgreSQL** - Use Vercel Postgres or external DB
2. **Persistent storage** - Use Vercel KV or S3
3. **Local SQLite** - Works but resets on deploy

---

## Option 2: Docker

Deploy anywhere Docker runs.

### Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment defaults
ENV NODE_ENV=production

# Start app
CMD ["npm", "start"]
```

### Create Docker Compose

```yaml
version: '3.8'

services:
  gamehub:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:./gamehub.db
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
      - RAWG_API_KEY=${RAWG_API_KEY}
    volumes:
      - ./gamehub.db:/app/gamehub.db
      - ./public:/app/public
    restart: unless-stopped
```

### Deploy with Docker

```bash
# Build image
docker build -t gamehub .

# Run container
docker run -p 3000:3000 \
  -e ADMIN_PASSWORD="password" \
  -e NEXT_PUBLIC_APP_URL="https://yourdomain.com" \
  -v $(pwd)/gamehub.db:/app/gamehub.db \
  gamehub
```

### Using Docker Compose

```bash
# Create .env file
cat > .env << EOF
ADMIN_PASSWORD=your_password
NEXT_PUBLIC_APP_URL=https://yourdomain.com
RAWG_API_KEY=your_api_key
EOF

# Start services
docker-compose up -d

# Stop services
docker-compose down
```

### Pros
- ✅ Works anywhere
- ✅ Consistent environments
- ✅ Easy scaling
- ✅ Database persistence

### Cons
- ❌ Requires Docker setup
- ❌ More complex than Vercel

---

## Option 3: Self-Hosted VPS

Deploy on your own server (DigitalOcean, Linode, AWS, etc.).

### Server Requirements

- **OS**: Ubuntu 20.04+ or similar
- **RAM**: 1-2GB minimum
- **Storage**: 500MB+ (more for games)
- **CPU**: 1-2 cores sufficient

### Installation Steps

#### 1. Connect to Server

```bash
ssh user@your-server-ip
```

#### 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs npm
```

Verify:
```bash
node --version  # Should be v18+
npm --version   # Should be 9+
```

#### 3. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/GameHub.git
sudo chown -R $USER:$USER GameHub
cd GameHub
```

#### 4. Install Dependencies

```bash
npm install
```

#### 5. Configure Environment

```bash
nano .env.local
```

Add:
```env
DATABASE_URL="file:./gamehub.db"
ADMIN_PASSWORD="your_secure_password"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
RAWG_API_KEY="your_api_key"
```

Save (Ctrl+X, Y, Enter)

#### 6. Initialize Database

```bash
npm run db:migrate
npm run seed
```

#### 7. Build Application

```bash
npm run build
```

#### 8. Start with PM2 (Process Manager)

```bash
# Install PM2
sudo npm install -g pm2

# Start app
pm2 start "npm start" --name gamehub

# Auto-restart on boot
pm2 startup
pm2 save

# Monitor
pm2 logs gamehub
```

#### 9. Setup Nginx Reverse Proxy

```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/default
```

Replace with:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save and restart:
```bash
sudo systemctl restart nginx
```

#### 10. Setup SSL with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
sudo systemctl restart nginx
```

#### 11. Setup Backup

```bash
# Create backup script
cat > backup-gamehub.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/gamehub"
mkdir -p $BACKUP_DIR
cp /opt/GameHub/gamehub.db $BACKUP_DIR/gamehub_$(date +%Y%m%d_%H%M%S).db
# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
EOF

chmod +x backup-gamehub.sh

# Schedule daily backup
sudo crontab -e
# Add: 0 2 * * * /path/to/backup-gamehub.sh
```

### Pros
- ✅ Full control
- ✅ No limits
- ✅ Cheap ($5-20/month)
- ✅ Database persistence

### Cons
- ❌ Requires Linux knowledge
- ❌ Need to manage updates
- ❌ Responsible for security

---

## Option 4: NAS (Synology, QNAP, etc.)

Perfect for home labs!

### Prerequisites

- Docker support on NAS
- SSH access
- At least 2GB RAM allocated

### Steps

1. **Install Docker** (if not installed)
   - Package Center → Docker

2. **Create Docker container**
   - Registry → Search "node"
   - Download node:18-alpine
   - Create new container with settings above

3. **Persistent Storage**
   - Mount volume for `/app/gamehub.db`
   - Mount volume for game files

4. **Environment Variables**
   - Set in container settings

5. **Access App**
   - `http://nas-ip:3000`

---

## Option 5: Cloud Platforms

### AWS EC2

Similar to VPS, but using AWS:

1. Launch EC2 instance (t2.micro free tier)
2. Follow VPS installation steps above
3. Configure security groups
4. Use Elastic IP for static address

### Azure

1. Create App Service
2. Use deployment slots
3. Configure managed databases
4. Built-in monitoring and scaling

### DigitalOcean App Platform

1. Connect GitHub repository
2. Auto-deploys on push
3. Managed PostgreSQL
4. Similar to Vercel but more control

---

## Post-Deployment

### Verify Deployment

1. Visit `https://yourdomain.com`
2. Check home page loads
3. Go to `/admin/login`
4. Login with password
5. Check dashboard statistics

### Scan for Games

Add your game directories and run initial scan:

```bash
# SSH into server
ssh user@server

# Start scan
cd /opt/GameHub
npm run scan
```

Or use admin dashboard.

### Monitor Application

```bash
# View logs
pm2 logs gamehub

# Monitor status
pm2 status

# Restart if needed
pm2 restart gamehub
```

### Backup Database

Set up automated backups:

```bash
# Weekly backup
0 2 * * 0 cp /opt/GameHub/gamehub.db /backups/gamehub_$(date +\%Y\%m\%d).db
```

### SSL/HTTPS

Always use HTTPS in production. Let's Encrypt provides free certificates.

### Security Updates

Keep Node.js and packages updated:

```bash
npm update
npm audit fix
npm run build
pm2 restart gamehub
```

---

## Troubleshooting Deployment

### App crashes on startup

```bash
# Check logs
pm2 logs gamehub

# Verify .env.local exists and is correct
cat .env.local

# Try manual start
npm start
```

### Database not found

```bash
# Initialize database
npm run db:migrate

# Check database file exists
ls -la gamehub.db
```

### Port already in use

```bash
# Change port in PM2
pm2 delete gamehub
pm2 start "npm start -- -p 3001" --name gamehub
```

### High memory usage

```bash
# Increase Node heap size
NODE_OPTIONS="--max-old-space-size=2048" npm start

# Or in PM2
pm2 start "npm start" --name gamehub --instance-var=INSTANCE_ID -- --node-args="--max-old-space-size=2048"
```

---

## Performance Tips

1. **Enable caching** - Already enabled by default
2. **Use CDN** - For static assets
3. **Compress database** - Run `sqlite3 gamehub.db "VACUUM;"`
4. **Increase resources** - More RAM for large libraries
5. **Regular backups** - Automated backup script

---

Next: [Troubleshooting →](./07-troubleshooting.md)
