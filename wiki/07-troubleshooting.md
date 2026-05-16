# Troubleshooting Guide 🐛

Solutions for common issues and problems.

## Installation Issues

### Node.js not found

**Error:** `npm: command not found` or `node: command not found`

**Solution:**
1. Install Node.js from [nodejs.org](https://nodejs.org)
2. Choose LTS version (18.x or later)
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### npm install fails

**Error:** `Error: EACCES: permission denied`

**Solution:**
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Or use sudo (not recommended)
sudo npm install
```

### Git clone fails

**Error:** `fatal: could not read Username`

**Solution:**
1. Install Git from [git-scm.com](https://git-scm.com)
2. Configure Git:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```
3. Try clone again

### Disk space error

**Error:** `ENOSPC: no space left on device`

**Solution:**
1. Check disk space: `df -h`
2. Free up space:
   ```bash
   # Clear npm cache
   npm cache clean --force
   
   # Remove node_modules and reinstall
   rm -rf node_modules
   npm install
   ```
3. Or move to larger disk

## Database Issues

### Database locked

**Error:** `SQLITE_BUSY: database is locked`

**Solution:**
1. Ensure only one server instance running
2. Stop server: `npm stop` or `pm2 stop gamehub`
3. Delete lock file: `rm -f gamehub.db-*`
4. Start server again

### Database corrupted

**Error:** `Error: database disk image is malformed`

**Solution:**
1. Backup corrupted database:
   ```bash
   cp gamehub.db gamehub.db.corrupted
   ```
2. Restore from backup if available:
   ```bash
   cp gamehub.db.backup gamehub.db
   ```
3. Or recreate database:
   ```bash
   rm gamehub.db
   npm run db:migrate
   npm run seed
   ```

### Migration failed

**Error:** `PrismaClientInitializationError` or migration error

**Solution:**
```bash
# Reset and reinitialize database
npm run db:migrate -- --reset
npm run seed
```

⚠️ This deletes all data. Restore from backup if needed.

### Games not in database after scan

**Error:** Games scanned but don't appear in library

**Solution:**
1. Check scan logs in admin dashboard
2. Verify files exist: `ls -la /path/to/games/`
3. Check file permissions:
   ```bash
   chmod 644 /path/to/games/*
   ```
4. Manual scan:
   ```bash
   npm run scan
   ```
5. Check admin dashboard for errors

## Server Issues

### Port already in use

**Error:** `Error: listen EADDRINUSE :::3000`

**Solution:**
```bash
# Change port
npm run dev -- -p 3001

# Or find and kill process using port 3000
# Linux/Mac
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Connection refused

**Error:** `Error: connect ECONNREFUSED`

**Solution:**
1. Ensure server is running: `pm2 status`
2. Check logs: `pm2 logs gamehub`
3. Restart server:
   ```bash
   pm2 restart gamehub
   ```
4. Check firewall allows port 3000

### Server crashes immediately

**Error:** Process exits with error code

**Solution:**
1. Check logs:
   ```bash
   pm2 logs gamehub --lines 50
   ```
2. Verify .env.local file:
   ```bash
   cat .env.local
   ```
3. Check required variables are set
4. Try manual start:
   ```bash
   npm start
   ```

### High memory usage

**Error:** Server uses excessive RAM

**Solution:**
1. Increase available memory:
   ```bash
   NODE_OPTIONS="--max-old-space-size=2048" npm start
   ```
2. Reduce library size or split across servers
3. Use external database instead of SQLite for very large libraries

### Slow performance

**Error:** Pages load slowly, timeouts

**Solution:**
1. Check server resources: `top`, `htop`
2. Optimize database:
   ```bash
   sqlite3 gamehub.db "VACUUM;"
   sqlite3 gamehub.db "ANALYZE;"
   ```
3. Check network connection
4. Reduce library size
5. Use CDN for static assets

## Configuration Issues

### .env.local not found

**Error:** Variables not loading, defaults used

**Solution:**
1. Create .env.local in root directory:
   ```bash
   cp .env.example .env.local
   nano .env.local
   ```
2. Add required variables
3. Restart server

### Password not working

**Error:** Can't login to admin panel

**Solution:**
1. Check ADMIN_PASSWORD in .env.local
2. Verify no extra spaces or quotes
3. Example: `ADMIN_PASSWORD="MySecurePass123!"`
4. Restart server after changing

### URL is wrong

**Error:** Download links go to wrong address

**Solution:**
Update NEXT_PUBLIC_APP_URL:

```env
# For localhost
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# For production
NEXT_PUBLIC_APP_URL="https://games.yourdomain.com"
```

Must include protocol (http:// or https://)

## Game Management Issues

### Games not found after scan

**Error:** Files exist but scan doesn't find them

**Solution:**
1. Check directory path is correct
2. Verify files have known extensions
3. Check file permissions:
   ```bash
   # Read permission required
   chmod 644 /path/to/games/*
   ```
4. Check scan logs for specific errors
5. Try manual scan: `npm run scan`

### Metadata not fetching

**Error:** Metadata button doesn't work or fails

**Solution:**
1. Verify RAWG API key in .env.local:
   ```bash
   echo $RAWG_API_KEY
   ```
2. Check API key is valid at [rawg.io](https://rawg.io)
3. Check RAWG rate limits (20 req/min free)
4. Try different game
5. Check browser console for error details

### Cover image not uploading

**Error:** Upload fails or image doesn't show

**Solution:**
1. Check image format (JPG, PNG, WebP)
2. Check file size (max ~5MB)
3. Verify browser allows file uploads
4. Try different image
5. Check disk space available
6. Check /public directory permissions:
   ```bash
   chmod 755 public/
   chmod 755 public/covers/
   ```

### DLC/Update not appearing

**Error:** Added DLC but doesn't show in game detail

**Solution:**
1. Verify DLC file path is correct
2. Check file still exists
3. Verify DLC type is set correctly ("DLC" vs "Update")
4. Hard refresh browser (Ctrl+Shift+R)
5. Clear browser cache

## Frontend Issues

### Page won't load

**Error:** Blank page or 404 error

**Solution:**
1. Check server is running: `pm2 status`
2. Verify browser can access `http://localhost:3000`
3. Check browser console for errors (F12)
4. Clear browser cache:
   - Chrome: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+Delete
   - Safari: Cmd+Shift+Delete
5. Try different browser

### Admin panel login not working

**Error:** Login button doesn't work or shows error

**Solution:**
1. Check password is correct
2. Verify .env.local has ADMIN_PASSWORD
3. Check browser console for JS errors
4. Try incognito/private browsing
5. Clear cookies:
   ```javascript
   // In browser console
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "")
       .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

### Images not loading

**Error:** Game covers show broken image icon

**Solution:**
1. Check cover file exists: `ls -la public/covers/`
2. Verify correct URL in database
3. Check file permissions:
   ```bash
   chmod 644 public/covers/*
   ```
4. Try re-uploading cover
5. Check browser console for 404 errors

### Buttons not responding

**Error:** Clicks don't work, page seems frozen

**Solution:**
1. Check browser console for JavaScript errors
2. Hard refresh page (Ctrl+F5 or Cmd+Shift+R)
3. Check network tab in DevTools (F12)
4. Ensure JavaScript is enabled
5. Try different browser

## Download Issues

### Download doesn't start

**Error:** Click download but nothing happens

**Solution:**
1. Check browser downloads enabled
2. Verify file still exists on disk
3. Check file permissions:
   ```bash
   ls -la /path/to/game/file
   chmod 644 /path/to/game/file
   ```
4. Try different game
5. Check server logs: `pm2 logs gamehub`

### Queue not working

**Error:** Download queue errors or stuck status

**Solution:**
1. Clear queue entries (might be in Prisma Studio)
2. Delete gamehub.db and reinitialize:
   ```bash
   rm gamehub.db
   npm run db:migrate
   ```
3. Check disk space for downloads
4. Verify download paths are correct

### File size wrong

**Error:** File size shows incorrectly

**Solution:**
1. Update game file size:
   - Edit game
   - Set correct file size manually
   - Or delete and rescan
2. Clear browser cache (Ctrl+Shift+Delete)

## API Issues

### API endpoint returns 404

**Error:** `/api/games` or other endpoint not found

**Solution:**
1. Check endpoint URL is correct
2. Verify server is running
3. Check API path in code matches route
4. Restart server: `npm run dev`
5. Check browser console for exact error

### CORS errors

**Error:** `Cross-Origin Request Blocked`

**Solution:**
Usually not an issue for same-origin requests.

If using API from different domain:
1. Check CORS is enabled in next.config.mjs
2. Verify request is from allowed origin
3. Check Authorization header if needed

### Authentication fails

**Error:** API returns 401 Unauthorized

**Solution:**
1. Verify admin session cookie exists
2. Check session is not expired (30 days)
3. Re-login to admin panel
4. Check ADMIN_PASSWORD in .env.local

## Network Issues

### Can't access from other computer

**Error:** Server unreachable from another device

**Solution:**
1. Check server IP: `ifconfig` or `ipconfig`
2. Use IP instead of localhost: `http://192.168.x.x:3000`
3. Check firewall allows port 3000
4. Check router port forwarding (if needed)
5. Enable HTTPS if accessing over internet

### Slow from other network

**Error:** App loads slowly over network

**Solution:**
1. Check network speed: `speedtest.net`
2. Move closer to server/WiFi
3. Use wired connection if possible
4. Optimize images: smaller file sizes
5. Enable compression in nginx:
   ```nginx
   gzip on;
   gzip_types text/plain text/css application/json;
   ```

## Getting Help

If issue persists:

1. **Check logs**
   ```bash
   pm2 logs gamehub --lines 100
   ```

2. **Check browser console** (F12)
   - Look for red error messages
   - Copy full error text

3. **Search documentation** - Check wiki first

4. **Report issue** - GitHub Issues with:
   - Error message (exact text)
   - Steps to reproduce
   - Server logs
   - Environment (OS, Node.js version, etc.)

---

**Still stuck?** Check the [GitHub Issues](https://github.com) or ask for help!
