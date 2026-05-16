# Game Management 🎮

Complete guide to managing your game library in GameHub.

## Adding Games

### Method 1: Auto-Scan (Recommended)

The easiest way to populate your library:

1. Place game files in directories
2. Go to **Admin** → **Scan Panel**
3. Configure scan directories
4. Click **"Start Scan"**
5. Wait for scan to complete
6. Games appear automatically!

### Method 2: Manual Entry

Add individual games manually:

1. Go to **Admin** → **Games** → **New Game**
2. Fill in game information:
   - Title (required)
   - Platform (required)
   - File path (required)
   - Release year
   - Genre
   - Developer
   - Publisher
3. Click **"Create Game"**
4. Upload cover image (optional)

### Method 3: Bulk Import

For importing from CSV or database:

Currently, bulk import is done via:
- Direct database edits in Prisma Studio
- SQL scripts (advanced)
- Programmatic API calls

## Game Details

### Required Information

- **Title** - Game name (e.g., "The Legend of Zelda")
- **Platform** - Console/system (PC, PS Vita, etc.)
- **File Path** - Location on disk (e.g., `/games/psvita/zelda.zip`)

### Optional Metadata

- **Release Year** - Publication year
- **Genre** - Game category (RPG, Action, etc.)
- **Developer** - Studio that made the game
- **Publisher** - Studio that published it
- **Description** - Full game description
- **Trailer URL** - YouTube video link
- **Custom Notes** - Admin notes

### Cover Image

Upload game cover artwork:

1. Click **"Upload Cover"** on game edit page
2. Select image (PNG, JPG, WebP)
3. Use crop tool to adjust
4. Save

The system supports:
- JPG/JPEG - Lossy compression (smaller files)
- PNG - Lossless compression
- WebP - Modern format (best compression)

Recommended dimensions: 300x450px (2:3 ratio)

## Managing DLCs and Updates

GameHub treats DLCs and Updates separately from the base game:

### Adding DLC

1. Go to game → **Edit**
2. Scroll to **DLC Management**
3. Click **"Add DLC"**
4. Fill in:
   - Title
   - Type: "DLC"
   - File path
   - File size
5. Save

### Adding Updates

Updates are like DLC but marked differently:

1. Go to game → **Edit**
2. Scroll to **DLC Management**
3. Click **"Add Update"**
4. Fill in:
   - Title (version number, e.g., "Update 1.5")
   - Type: "Update"
   - File path
   - File size
5. Save

### Update Display

In the game detail modal:

- **Updates** section shows update files
- **DLC** section shows DLC files
- Both show file size and have download buttons

## Organizing Games by Platform

### What are Platforms?

Platforms represent gaming systems:
- PC (Windows)
- PlayStation Vita
- PSP
- Nintendo DS
- Game Boy Advance
- SNES
- And more...

### Managing Platforms

1. Go to **Admin** → **Settings**
2. In "Platform Management":
   - Enable/disable platforms
   - Change display order
   - View game counts

### Creating Custom Platforms

Currently, platforms are predefined. To add custom ones:

1. Open **Prisma Studio**: `npm run db:studio`
2. Go to **Platform** table
3. Click **Add record**
4. Fill in:
   - Name (e.g., "Dreamcast")
   - Slug (e.g., "dreamcast")
   - Color (hex code)
5. Save

## Fetching Metadata from RAWG

Automatically fetch game information from RAWG.io:

### Single Game Metadata

1. Go to **Admin** → **Games**
2. Find game
3. Click **"Fetch Metadata"**
4. Review fetched data
5. Click **"Save"** to apply

### Batch Fetch

For multiple games at once:

1. Go to **Admin** → **Metadata Batch**
2. Configure:
   - Select games to fetch
   - Or select by platform
3. Click **"Start Batch Fetch"**
4. Monitor progress
5. Review results

### What Gets Fetched?

- Game title
- Cover image (auto-uploads)
- Description
- Release year
- Genre
- Developer
- Publisher
- User rating

### Handling Mismatches

If RAWG returns wrong game:

1. Manually edit after fetch
2. Or search RAWG directly and copy ID
3. Modify metadata as needed

## Hiding and Deleting Games

### Hide Game

Keep game in database but hide from public:

1. Edit game
2. Check **"Hidden"** checkbox
3. Save

Hidden games:
- Don't appear in library
- Still accessible if you know URL
- Useful for testing or staging

### Delete Game

Permanently remove game from database:

1. Edit game
2. Click **"Delete"** button
3. Confirm deletion

⚠️ **Warning**: Deletion is permanent and cannot be undone!

## Bulk Operations

### Update Multiple Games

Currently done via Prisma Studio or database tools.

### Hide All Games of Platform

Via admin dashboard:

1. Go to **Admin** → **Settings**
2. Disable platform
3. All games in that platform become hidden

## Search and Filtering

### In Public Library

Users can:
- Browse by platform
- Search by title
- Filter by genre (if metadata present)

### In Admin Panel

Admins can:
- Search by title
- Filter by platform
- Show/hide hidden games
- Sort by various fields

## Game Statistics

### View Stats

In **Admin Dashboard**:

- **Total Games** - Number of games
- **Platforms** - Number of platforms
- **Total Size** - Storage used
- **Missing Covers** - Games without images
- **No Metadata** - Games without RAWG info

## Organizing File Structure

Best practice file organization:

```
games/
├── PC/
│   ├── Game1.zip
│   └── Game2.zip
├── psvita/
│   ├── VitaGame1.zip
│   └── VitaGame2.zip
├── psp/
│   ├── PSP_Game1.iso
│   └── PSP_Game2.zip
└── ds/
    └── NintendoDS_Game.zip
```

### File Naming Tips

1. **Use meaningful names**
   - ✅ "Persona4.zip"
   - ❌ "game.zip"

2. **Include system name** (optional)
   - ✅ "psvita_danganronpa.zip"
   - ❌ "danganronpa.zip"

3. **Avoid special characters**
   - Use: `-`, `_`, alphanumeric
   - Avoid: `<`, `>`, `|`, `?`, `*`, `"`

4. **Version numbering** (for updates)
   - ✅ "Game_v1.5.zip"
   - ❌ "Game_final_FINAL_v2.zip"

## Troubleshooting Game Issues

### Game not appearing after scan

1. Check file path exists
2. Verify file permissions (readable)
3. Check scan logs for errors
4. Try manual entry

### Metadata not fetching

1. Verify RAWG API key is set
2. Check RAWG has the game
3. Try searching RAWG.io directly
4. Check API rate limits

### Cover not uploading

1. Verify image format (JPG, PNG, WebP)
2. Check file size (max ~5MB)
3. Try different image
4. Check browser console errors

### Download not working

1. Verify file path is correct
2. Check file still exists
3. Verify file permissions
4. Check disk space

---

Next: [Admin Panel Guide →](./04-admin-panel.md)
