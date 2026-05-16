# Installation Guide 🚀

Complete guide to install and set up GameHub on your system.

## Prerequisites

Before starting, ensure you have:

- **Node.js** 18.17 or higher
  - Download from [nodejs.org](https://nodejs.org)
  - Verify: `node --version` and `npm --version`
- **Git** (for cloning)
  - Download from [git-scm.com](https://git-scm.com)
- **~500MB** free disk space
- **Administrator access** (for some operations)

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/GameHub.git
cd GameHub
```

If you don't have git, you can download the repository as a ZIP file from GitHub.

## Step 2: Install Dependencies

```bash
npm install
```

This downloads and installs all required packages. Takes 2-5 minutes depending on your connection.

## Step 3: Configure Environment Variables

### Create .env.local file

Copy the example file:

```bash
cp .env.example .env.local
```

Or create it manually in the root directory with:

```env
# Database configuration
DATABASE_URL="file:./gamehub.db"

# Admin authentication (CHANGE THIS!)
ADMIN_PASSWORD="your_secure_password_here"

# Public server URL (used for download links)
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional: RAWG API for game metadata
RAWG_API_KEY="your_api_key_here"
```

### Configuration Details

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | SQLite database path | `file:./gamehub.db` |
| `ADMIN_PASSWORD` | Admin panel login password | Any strong password |
| `NEXT_PUBLIC_APP_URL` | Public server URL (for links) | `http://localhost:3000` or `https://games.domain.com` |
| `RAWG_API_KEY` | Optional: Game metadata source | Get from [rawg.io](https://rawg.io/api) |

### Security Tips

1. Use a strong admin password:
   - At least 16 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - NOT something easily guessable

2. For production:
   - Use HTTPS URL
   - Change password immediately after first login
   - Never commit `.env.local` to git

## Step 4: Initialize Database

Create the SQLite database and run migrations:

```bash
npm run db:migrate
```

Then seed initial platform data:

```bash
npm run seed
```

This creates:
- `gamehub.db` - Your SQLite database file
- Database tables (games, platforms, settings, etc.)
- Initial console/platform definitions

### What Gets Seeded?

The seed script creates these platforms:

- PC (Windows)
- PlayStation Vita
- PSP (PlayStation Portable)
- Nintendo DS
- Game Boy Advance
- SNES
- NES
- Arcade
- And more...

You can add or modify platforms in the admin panel later.

## Step 5: Configure Game Directories (Optional)

Before scanning, decide where your game files are:

```
Games/
├── PC/
│   ├── Game1.zip
│   └── Game2.zip
├── PS Vita/
│   ├── PSVita_Game1.zip
│   └── PSVita_Game2.zip
└── PSP/
    └── PSP_Game.iso
```

Games can be in any format:
- `.zip` - Compressed archives
- `.iso` - Disc images
- `.rar` - RAR archives
- Folders with game files
- Any file type (system will detect)

The scanner is flexible and will find games in subdirectories.

## Step 6: First Run

Start the development server:

```bash
npm run dev
```

You should see:

```
▲ Next.js 14.2.35
  - Local:        http://localhost:3000
```

Visit `http://localhost:3000` in your browser.

### First Login

1. Go to `http://localhost:3000/admin/login`
2. Enter password from `.env.local`
3. You're in the admin dashboard!

## Step 7: Scan for Games

From the admin dashboard:

1. Go to **Scan Panel**
2. Configure your game directories
3. Click **"Start Scan"**
4. Wait for scan to complete
5. Your games appear in the library!

Or use the command line:

```bash
npm run scan
```

## Step 8: Add Metadata (Optional)

To fetch game covers and metadata from RAWG:

1. Get a free API key: [rawg.io/api](https://rawg.io/api)
2. Add to `.env.local`:
   ```env
   RAWG_API_KEY="your_key_here"
   ```
3. Restart the server
4. In admin panel, click **"Fetch Metadata"** on games

## Verification

Check that everything works:

- ✅ Admin panel loads at `/admin/login`
- ✅ Home page shows platforms at `/`
- ✅ Games appear after scanning
- ✅ Can download a game file

If something's wrong, see [Troubleshooting](./07-troubleshooting.md).

## What's Next?

- [Configuration Guide](./02-configuration.md) - Detailed settings
- [Game Management](./03-game-management.md) - Add and organize games
- [Deployment Guide](./06-deployment.md) - Go live on your server

## Common Issues

### "npm: command not found"
- Node.js not installed
- Solution: Install from [nodejs.org](https://nodejs.org)

### "port 3000 is already in use"
- Another app is using port 3000
- Solution: `npm run dev -- -p 3001`

### Database errors
- Database locked or corrupted
- Solution: Delete `gamehub.db` and run `npm run db:migrate` again

### Games not found after scan
- Files not in expected locations
- Solution: Check scan logs in admin dashboard

See [Full Troubleshooting Guide](./07-troubleshooting.md) for more help.

---

Next: [Configuration Guide →](./02-configuration.md)
