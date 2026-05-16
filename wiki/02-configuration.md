# Configuration Guide ⚙️

Detailed guide for configuring GameHub settings and options.

## Environment Variables

All configuration is done through the `.env.local` file in the root directory.

### Required Variables

```env
DATABASE_URL="file:./gamehub.db"
ADMIN_PASSWORD="your_secure_password"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Optional Variables

```env
RAWG_API_KEY="your_api_key_here"
```

## Database Configuration

### SQLite (Default)

GameHub uses SQLite by default, which requires no additional setup:

```env
DATABASE_URL="file:./gamehub.db"
```

This creates a single `gamehub.db` file in your project root.

### Custom Database Location

To store the database elsewhere:

```env
DATABASE_URL="file:/var/lib/gamehub/gamehub.db"
```

### Backup

SQLite databases are just files, making backups simple:

```bash
# Linux/Mac
cp gamehub.db gamehub.db.backup

# Windows
copy gamehub.db gamehub.db.backup
```

Or set up automated backups:

```bash
# Daily backup script (cron)
0 2 * * * cp /path/to/gamehub.db /backups/gamehub.db.$(date +%Y%m%d)
```

## Admin Authentication

### Setting Admin Password

In `.env.local`:

```env
ADMIN_PASSWORD="YourSecurePassword123!@#"
```

### Password Best Practices

1. **Length**: At least 16 characters
2. **Complexity**: Mix uppercase, lowercase, numbers, symbols
3. **Randomness**: Avoid dictionary words or patterns
4. **Uniqueness**: Don't reuse other passwords
5. **Storage**: Keep in password manager, not in code

### Changing Password

There's no direct way to change password without `.env.local`, but you can:

1. Edit `.env.local` with new password
2. Restart the application
3. Login with new password

### Forgot Password?

1. Edit `.env.local`
2. Set new `ADMIN_PASSWORD`
3. Restart server
4. Login with new password

## Public URL Configuration

### What is NEXT_PUBLIC_APP_URL?

This URL is used to:
- Build download links sent to users
- Construct queue URLs
- Generate public-facing links

### Local Development

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Production

```env
NEXT_PUBLIC_APP_URL="https://games.yourdomain.com"
```

Must include the protocol (`http://` or `https://`)

### Important Notes

- Must be accessible from outside your network
- Use HTTPS in production
- Update when changing domain
- Users receive this URL in download links

## Game Metadata Configuration

### RAWG.io Integration

GameHub can fetch game metadata (covers, descriptions, metadata) from RAWG.

### Getting RAWG API Key

1. Visit [rawg.io/api](https://rawg.io/api)
2. Sign up for free account
3. Create API key in settings
4. Add to `.env.local`:

```env
RAWG_API_KEY="abc123def456..."
```

### Rate Limiting

RAWG free tier:
- 20 requests per minute
- 100,000 per month

Use the batch metadata feature to fetch efficiently.

### Disabling RAWG

Simply remove or comment out `RAWG_API_KEY` to disable.

## Admin Panel Settings

Beyond `.env.local`, additional settings are managed in the admin panel:

### Platforms Management

Configure which platforms are visible and their order:

1. Go to **Admin** → **Settings**
2. Manage platforms:
   - Enable/disable platforms
   - Change display order
   - View game counts

### Donation Configuration

Configure donation methods:

1. Go to **Admin** → **Settings**
2. Add donation links for:
   - Ko-fi
   - PayPal
   - Buy Me a Coffee
   - Crypto addresses

### Game Directory Scanning

Configure where GameHub scans for game files:

1. Go to **Admin** → **Scan Panel**
2. Add scan directories (e.g., `/games/psvita`, `/games/pc`)
3. Adjust scan settings if needed

## Security Configuration

### HTTPS/SSL

Recommended for production:

1. Obtain SSL certificate (Let's Encrypt, Cloudflare, etc.)
2. Configure in reverse proxy or hosting platform
3. Update `NEXT_PUBLIC_APP_URL` to `https://`

### Behind Reverse Proxy

If using nginx, Apache, or Cloudflare:

```env
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
# Internal port stays the same
```

### Access Control

Currently, admin panel access is password-only. For additional security:

1. Use VPN or private network
2. Use IP allowlisting (nginx/WAF)
3. Use HTTP Basic Auth (reverse proxy)

Example nginx config:

```nginx
location /admin {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

## Logging Configuration

### Console Logs

GameHub logs to console. In production, redirect:

```bash
npm start > gamehub.log 2>&1
```

Or use a process manager like PM2:

```bash
pm2 start "npm start" --name gamehub
pm2 logs gamehub
```

### Log Levels

Currently hardcoded to development level. Modify in code if needed.

## Database Maintenance

### Checking Database Health

```bash
npm run db:studio
```

Opens Prisma Studio to browse and edit data.

### Backing Up Database

Automated backup script:

```bash
#!/bin/bash
BACKUP_DIR="/backups/gamehub"
DATE=$(date +%Y%m%d_%H%M%S)
cp gamehub.db "$BACKUP_DIR/gamehub_$DATE.db"
# Keep only last 30 backups
find $BACKUP_DIR -type f -mtime +30 -delete
```

### Restoring from Backup

```bash
cp gamehub.db gamehub.db.corrupted
cp gamehub.db.backup gamehub.db
npm run dev  # restart
```

## Performance Tuning

### Enable Caching

Already enabled by default with:
- SWR data fetching
- Static image caching
- SQLite query optimization

### Increase Buffer Size

For very large libraries (10,000+ games), increase Node heap:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### Database Optimization

SQLite optimization (auto-run, but can force):

```bash
sqlite3 gamehub.db "VACUUM;"
sqlite3 gamehub.db "ANALYZE;"
```

## Environment Variables Reference

Complete list of all supported environment variables:

```env
# Required
DATABASE_URL="file:./gamehub.db"
ADMIN_PASSWORD="your_password"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional
RAWG_API_KEY="your_api_key"

# Internal (set automatically)
NODE_ENV="production"  # or "development"
```

## Troubleshooting Configuration

### Changes not taking effect
- Restart the server: `npm run dev`
- Clear browser cache (Ctrl+Shift+Delete)
- Check for typos in `.env.local`

### Configuration file not found
- Ensure `.env.local` is in the root directory
- Restart server after creating file
- Check file is not named `.env` (must be `.local`)

### RAWG API key not working
- Check API key is valid
- Verify rate limits not exceeded
- Try with new key from rawg.io

---

Next: [Game Management →](./03-game-management.md)
