# Admin Panel Guide 👨‍💼

Complete walkthrough of the admin panel features and tools.

## Accessing Admin Panel

### Login

1. Navigate to: `http://yourdomain.com/admin/login`
2. Enter admin password (from `.env.local`)
3. Click **"Login"**
4. You're logged in for 30 days

### Logout

Click **"Logout"** in any admin page (top right corner).

### Session Timeout

Sessions expire after 30 days of inactivity. You'll need to log in again.

## Dashboard

The main admin dashboard shows system statistics and recent activity.

### Statistics Cards

**Total Games** - Count of all games in library

**Platforms** - Count of enabled platforms

**Total Size** - Combined storage of all game files

**Missing Covers** - Games without cover images
- Click to view list
- Great for identifying gaps

**No Metadata** - Games without RAWG metadata
- Click to fetch metadata for these games

### Recent Scans

Table showing last 5 directory scans:

- **Date** - When scan ran
- **Duration** - How long it took
- **Found** - Games discovered
- **Added** - New games added to library
- **Updated** - Games with changed files
- **Stale** - Games with missing files

## Game Management

### Games List

View all games in your library:

1. Go to **Admin** → **Games**
2. See all games with:
   - Cover thumbnail
   - Title and platform
   - File size
   - Quick actions

### Create Game

Add a new game manually:

1. Click **"+ New Game"** button
2. Fill in required fields:
   - Title
   - Platform
   - File path
3. Fill in optional fields:
   - Release year
   - Genre
   - Developer
   - Publisher
   - Description
   - Trailer URL
   - Custom notes
4. Click **"Create"**
5. Upload cover image (optional)

### Edit Game

Modify existing game:

1. Find game in list
2. Click game title or **"Edit"** button
3. Update any fields
4. Click **"Save"**

### Delete Game

Remove game from library:

1. Find game
2. Click **"Edit"**
3. Scroll to bottom
4. Click **"Delete Game"**
5. Confirm deletion

⚠️ This is permanent!

### Cover Management

Upload and adjust game covers:

#### Upload Cover

1. Edit game
2. Click **"Upload Cover"**
3. Select image file (JPG, PNG, WebP)
4. Recommended: 300x450px (2:3 ratio)

#### Crop Cover

Fine-tune cover appearance:

1. Edit game
2. Click **"Adjust Cover"** (if exists)
3. Use crop tool:
   - Drag to reposition
   - Pinch or scroll to zoom
4. Click **"Save"**

#### Remove Cover

1. Edit game
2. Click **"Remove Cover"**
3. Confirm

## Scanning & Discovery

### Scan Panel

Automatically discover games from directories.

#### Configure Directories

1. Go to **Admin** → **Scan Panel**
2. Under **Scan Directories**:
   - Click **"Add Directory"**
   - Enter full path (e.g., `/games/psvita`, `C:\Games\PSP`)
   - Click **"Add"**
3. Repeat for each directory

#### Run Scan

1. Click **"Start Scan"**
2. Monitor progress:
   - Files found
   - Games indexed
   - Scan duration
3. Review results when complete

#### Scan Settings

- **Auto-detect platform** - Try to detect platform from directory structure
- **Recursive** - Search subdirectories (default: on)
- **Extensions** - File types to look for (default: all)

#### Scan Logs

View detailed history:

- All scans listed with date
- Results breakdown (added/updated/stale)
- Duration of each scan

### Manual Scan

Run scanner from command line:

```bash
npm run scan
```

Useful for:
- Automated scanning via cron/scheduler
- Batch operations
- Debugging

## Metadata Management

### Fetch Metadata (Single)

Get game info from RAWG:

1. Edit game
2. Click **"Fetch Metadata from RAWG"**
3. Search results appear
4. Select correct game
5. Review data and click **"Apply"**

### Fetch Metadata (Batch)

Get metadata for multiple games:

1. Go to **Admin** → **Metadata Batch**
2. Configure batch:
   - **Select games**: Choose specific games
   - **Select platform**: All games in platform
   - **All without metadata**: Games with no RAWG info
3. Click **"Start Batch Fetch"**
4. Monitor progress
5. Review results when complete

### What Gets Fetched?

- Title and cover
- Description
- Release date/year
- Genre
- Developer & publisher
- User rating
- And more

### Manual Search

If auto-fetch doesn't find the game:

1. Search RAWG.io directly
2. Find the game you want
3. Note the game ID
4. Return to GameHub
5. Edit game
6. Enter RAWG ID manually (if supported)

## Settings

### Platform Management

Enable/disable platforms and set display order:

1. Go to **Admin** → **Settings**
2. Platform Management section:
   - **Enable/Disable** - Toggle platform visibility
   - **Reorder** - Drag to change display order
   - **Game Count** - See how many games per platform

### Donation Configuration

Set up donation methods:

1. Go to **Admin** → **Settings**
2. Donation Settings section:
   - **Ko-fi Link** - Your Ko-fi profile URL
   - **PayPal Link** - PayPal.me link
   - **Buy Me a Coffee** - BMAC profile
   - **Crypto Address** - Wallet address
   - **Custom Message** - Text shown on donation page
3. Click **"Save"**

Donations appear in `/donate` page for users.

### System Preferences

Other configuration options:

- Enable/disable analytics
- Set site title
- Configure privacy settings
- Adjust UI preferences

## Traffic Analytics

### Dashboard

View visitor statistics:

1. Go to **Admin** → **Traffic**
2. See:
   - Total visitors
   - Unique sessions
   - Page views
   - Download activity

### Charts

Visual representations of:
- Visitors over time
- Page popularity
- Download trends
- Geographic distribution

### Detailed Logs

Table of all requests:

- **Date/Time** - When request occurred
- **IP Address** - Visitor's IP
- **Country/City** - Location (geo-lookup)
- **Page** - Which page visited
- **Status** - Request result (200, 404, etc.)
- **Device** - Browser/device info

### Using Analytics

Analytics help:
- Monitor usage patterns
- Find popular games
- Identify issues (404s)
- Plan improvements
- Understand audience

## Donations

### Donation History

View donations received:

1. Go to **Admin** → **Donations**
2. See table of:
   - Donation date
   - Amount
   - Donor name (if provided)
   - Method (Ko-fi, PayPal, etc.)
   - Notes

### Configuration

Add donation links in **Settings** → **Donation Settings**

Visitors access donations via `/donate` page.

## User Accounts

### Current User

Currently, GameHub supports only one admin account (the password).

### Adding Multiple Admins

Future versions may support multiple accounts.

Currently, to have multiple admins:
- Share single password
- Use environment-based password management
- Implement custom authentication layer

## Security Management

### Password Management

- Change password via `.env.local` + restart
- No in-app password change feature (currently)
- Session-based login with JWT tokens

### Session Management

- Auto-logout after 30 days
- Session cookie is HttpOnly and SameSite
- No active session listing (currently)

### Audit Logs

Currently limited logging. For better audit trails:

- Review server access logs
- Check database for changes
- Monitor admin actions manually

## Backup & Recovery

### Database Backup

Backup your SQLite database:

```bash
# Manual backup
cp gamehub.db gamehub.db.backup

# Automated backup (daily via cron)
0 2 * * * cp /path/to/gamehub.db /backups/gamehub_$(date +\%Y\%m\%d).db
```

### Database Recovery

If database corrupted:

1. Stop the application
2. Restore from backup:
   ```bash
   cp gamehub.db.backup gamehub.db
   ```
3. Restart application

### Data Export

Export data from Prisma Studio:

1. Run: `npm run db:studio`
2. Browse tables
3. Export to CSV (if supported)
4. Or manually copy data

## Troubleshooting Admin Issues

### Can't login

- Check password in `.env.local`
- Ensure `.env.local` file exists
- Try restarting server
- Check browser cookies enabled

### Scan not finding games

- Verify directory path is correct
- Check file permissions
- Ensure files have recognized extensions
- Check scan logs for errors

### Metadata fetch failing

- Verify RAWG API key set
- Check API rate limits
- Try different game
- Check internet connection

### Settings not saving

- Check browser console for errors
- Verify you have admin access
- Try different browser
- Clear browser cache

---

Next: [API Reference →](./05-api-reference.md)
