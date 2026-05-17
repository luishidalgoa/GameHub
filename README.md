# GameHub Quick Start Guide ⚡

Get up and running with GameHub in 5 minutes!

## Prerequisites

- Node.js 18+ - [Download](https://nodejs.org)
- git - [Download](https://git-scm.com)
- Your game files ready to scan

## Installation (5 min)

### Step 1: Clone & Install (1 min)

```bash
git clone https://github.com/luishidalgoa/GameHub.git
cd GameHub
npm install
```

### Step 2: Setup Environment (1 min)

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="file:./gamehub.db"
ADMIN_PASSWORD="MySecurePass123!@#"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 3: Initialize Database (1 min)

```bash
npm run db:migrate
npm run seed
```

### Step 4: Start Server (1 min)

```bash
npm run dev
```

You should see:
```
▲ Next.js 14.2.35
  - Local:        http://localhost:3000
```

### Step 5: Login (1 min)

1. Visit `http://localhost:3000`
2. Click admin icon (top right) or go to `/admin/login`
3. Enter password from `.env.local`
4. Welcome to your game library!

## First Game

### Option A: Auto-Scan (Easiest)

1. Place games in folder (e.g., `/games/psvita/`)
2. Admin → Scan Panel → Add Directory
3. Enter path: `/games/psvita/`
4. Click "Start Scan"
5. Games appear automatically!

### Option B: Manual Add

1. Admin → Games → New Game
2. Fill in:
   - Title: "Game Name"
   - Platform: "PSP"
   - File path: "/games/mygame.zip"
3. Click "Create"
4. Done!

## Common Commands

```bash
# Start development
npm run dev

# Build for production
npm run build

# Start production
npm start

# Scan for games
npm run scan

# Open database viewer
npm run db:studio
```

## Production Deployment

Choose one:

### Option 1: Vercel (Free, Easy)

```bash
git push
# Go to vercel.com → Import from GitHub
# Add environment variables
# Done!
```

### Option 2: Docker (Flexible)

```bash
docker build -t gamehub .
docker run -p 3000:3000 \
  -e ADMIN_PASSWORD="yourpass" \
  -v $(pwd)/gamehub.db:/app/gamehub.db \
  gamehub
```

### Option 3: VPS ($5-20/month)

```bash
# SSH to server
ssh user@server

# Clone & setup
git clone https://github.com/yourusername/GameHub.git
cd GameHub
npm install
npm run db:migrate

# Configure .env.local
nano .env.local

# Start with PM2
npm install -g pm2
pm2 start "npm start" --name gamehub
pm2 startup
pm2 save
```

## File Organization

Organize games for easy scanning:

```
Games/
├── psvita/
│   ├── Game1.zip
│   └── Game2.zip
├── psp/
│   ├── PSPGame1.iso
│   └── PSPGame2.zip
├── pc/
│   ├── PCGame.zip
│   └── Expansion.zip
```

Then scan each folder separately in admin panel.

## Tips & Tricks

### Get RAWG Metadata

1. Go to [rawg.io/api](https://rawg.io/api)
2. Get free API key
3. Add to `.env.local`: `RAWG_API_KEY="your_key"`
4. In admin: "Fetch Metadata" on games

### Change Password

Edit `.env.local`:
```env
ADMIN_PASSWORD="NewPassword123!@#"
```

Restart server. New password works!

### Backup Database

```bash
# One-time backup
cp gamehub.db gamehub.db.backup

# Restore if needed
cp gamehub.db.corrupted gamehub.db.old
cp gamehub.db.backup gamehub.db
```

### Access From Another Computer

Replace `localhost` with your IP:
- Find IP: `ipconfig` (Windows) or `ifconfig` (Linux/Mac)
- Example: `http://192.168.1.100:3000`

## Troubleshooting

### Port Already In Use

```bash
npm run dev -- -p 3001
```

### Database Locked

```bash
rm gamehub.db-*
npm run dev
```

### Games Not Found

1. Check directory path is correct
2. Verify files exist: `ls -la /path/to/games/`
3. Check file permissions
4. Try: `npm run scan`

### Can't Login

- Check password in `.env.local`
- No extra spaces around password
- Restart server after changing

## Next Steps

- 📖 [Full Documentation](../wiki/)
- 🎮 [Game Management Guide](../wiki/03-game-management.md)
- 👨‍💼 [Admin Panel Guide](../wiki/04-admin-panel.md)
- 🚀 [Deployment Guide](../wiki/06-deployment.md)
- 🐛 [Troubleshooting](../wiki/07-troubleshooting.md)

## Support

- **Docs**: Check the [Wiki](../wiki/)
- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)

---

**Happy gaming! 🎮**
