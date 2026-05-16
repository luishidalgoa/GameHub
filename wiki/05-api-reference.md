# API Reference 🔌

Complete documentation of GameHub REST API endpoints.

## Overview

GameHub provides a REST API for:
- Browsing games and metadata
- Managing download queues
- Admin operations
- Third-party integrations

### Base URL

```
http://yourdomain.com/api/
```

### Authentication

- **Public endpoints**: No auth required
- **Admin endpoints**: Require valid session cookie

### Response Format

All endpoints return JSON.

Success response:
```json
{
  "data": { ... },
  "status": 200
}
```

Error response:
```json
{
  "error": "Error message",
  "status": 400
}
```

---

## Public Endpoints

### Games

#### List All Games

```http
GET /api/games
```

Returns all visible games.

**Query Parameters:**
- `platform` (optional) - Filter by platform slug
- `limit` (optional) - Limit results (default: 100)
- `offset` (optional) - Pagination offset

**Response:**
```json
[
  {
    "id": 1,
    "title": "Game Title",
    "platform": {
      "id": 1,
      "name": "PSP",
      "slug": "psp"
    },
    "fileSize": "1024000000",
    "releaseYear": 2015,
    "genre": "RPG",
    "developer": "Developer Name",
    "publisher": "Publisher Name",
    "description": "Game description...",
    "coverPath": "/covers/game1.jpg",
    "coverUrl": null,
    "trailerUrl": "https://youtube.com/...",
    "customNotes": "Notes...",
    "isFavorite": false,
    "isHidden": false,
    "region": "USA",
    "dlcs": [ ... ]
  }
]
```

#### Get Game Details

```http
GET /api/games/{gameId}
```

Get full details for a specific game.

**Parameters:**
- `gameId` (required) - Game ID

**Response:**
```json
{
  "id": 1,
  "title": "Game Title",
  ...full game object...
}
```

### Platforms

#### List Platforms

```http
GET /api/platforms
```

Returns all enabled platforms.

**Response:**
```json
[
  {
    "id": 1,
    "name": "PSP",
    "slug": "psp",
    "color": "#FF00FF",
    "sortOrder": 1,
    "enabled": true,
    "_count": {
      "games": 45
    }
  }
]
```

### Download Queue

#### Create Queue Entry

```http
POST /api/queue
```

Add a game to the download queue.

**Request Body:**
```json
{
  "gameId": 1,
  "dlcId": null
}
```

**Response:**
```json
{
  "token": "abc123def456...",
  "status": "waiting",
  "position": 5,
  "redirectUrl": null
}
```

**Status Values:**
- `waiting` - In queue, waiting for turn
- `ready` - Ready to download
- `downloading` - Download in progress
- `done` - Download complete
- `expired` - Token expired

#### Get Queue Status

```http
GET /api/queue/{token}
```

Poll queue status for download.

**Parameters:**
- `token` (required) - Queue token

**Response:**
```json
{
  "token": "abc123def456...",
  "status": "ready",
  "position": 0,
  "expiresAt": 1715000000000,
  "gameId": 1,
  "dlcId": null,
  "redirectUrl": "https://yourdomain.com/api/download/1?token=..."
}
```

### Donations

#### Log Donation

```http
POST /api/donate
```

Webhook endpoint for donation services (Ko-fi, PayPal, etc.).

**Request Headers:**
- `X-Kofi-Transaction-Id` (for Ko-fi)
- Or JSON body from PayPal, etc.

**Request Body (example Ko-fi):**
```json
{
  "data": "{\"kofi_transaction_id\":\"...\"}"
}
```

**Response:**
```json
{
  "status": "success"
}
```

---

## Admin Endpoints

**All admin endpoints require authentication (valid session cookie).**

### Authentication

#### Check Auth Status

```http
GET /api/auth/me
```

Check if current session is authenticated.

**Response:**
```json
{
  "admin": true
}
```

Or `401 Unauthorized` if not authenticated.

#### Login

```http
POST /api/auth/login
```

Create admin session.

**Request Body:**
```json
{
  "password": "admin_password"
}
```

**Response (success):**
```json
{
  "status": "ok",
  "message": "Logged in"
}
```

Sets `gamehub_session` cookie (HttpOnly, 30-day expiry).

**Response (failure):**
```json
{
  "error": "Invalid password",
  "status": 401
}
```

#### Logout

```http
GET /api/auth/logout
```

Destroy admin session.

**Response:**
```json
{
  "status": "ok"
}
```

Clears `gamehub_session` cookie.

### Game Management

#### Create Game

```http
POST /api/games
```

Create a new game.

**Request Body:**
```json
{
  "title": "New Game",
  "platformId": 1,
  "filePath": "/games/newgame.zip",
  "fileSize": "1024000000",
  "releaseYear": 2024,
  "genre": "Action",
  "developer": "Dev Name",
  "publisher": "Pub Name",
  "description": "Description...",
  "region": "USA"
}
```

**Response:**
```json
{
  "id": 42,
  "title": "New Game",
  ...
}
```

#### Update Game

```http
PUT /api/games/{gameId}
```

Update existing game.

**Parameters:**
- `gameId` (required)

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "New description",
  ...any fields to update...
}
```

**Response:**
```json
{
  "id": 42,
  "title": "Updated Title",
  ...
}
```

#### Delete Game

```http
DELETE /api/games/{gameId}
```

Remove game from library.

**Parameters:**
- `gameId` (required)

**Response:**
```json
{
  "status": "deleted",
  "id": 42
}
```

### Cover Management

#### Upload Cover

```http
POST /api/covers/upload
```

Upload cover image for a game.

**Request (multipart/form-data):**
- `gameId` (form field)
- `file` (image file, max 5MB)

**Response:**
```json
{
  "status": "success",
  "path": "/covers/game42.jpg"
}
```

#### Adjust Cover

```http
PUT /api/covers/adjust
```

Crop/adjust cover image.

**Request Body:**
```json
{
  "gameId": 42,
  "x": 10,
  "y": 20,
  "width": 300,
  "height": 450
}
```

**Response:**
```json
{
  "status": "success",
  "path": "/covers/game42.jpg"
}
```

### Scanning

#### Trigger Scan

```http
POST /api/scan
```

Start game directory scan.

**Request Body:**
```json
{
  "directories": ["/games/psp", "/games/psvita"],
  "recursive": true
}
```

**Response:**
```json
{
  "status": "started",
  "scanId": "scan_123"
}
```

#### Get Scan Progress

```http
GET /api/scan/{scanId}
```

Get current scan progress.

**Response:**
```json
{
  "id": "scan_123",
  "status": "running",
  "progress": 45,
  "found": 150,
  "added": 12,
  "updated": 5
}
```

### Settings

#### Get All Settings

```http
GET /api/settings
```

Retrieve all system settings.

**Response:**
```json
{
  "donate_kofi": "https://ko-fi.com/yourname",
  "donate_paypal": "https://paypal.me/yourname",
  "donate_bmac": "https://buymeacoffee.com/yourname",
  "donate_crypto": "wallet_address",
  "donate_message": "Support message",
  "shortener_url": "...",
  ...
}
```

#### Update Settings

```http
PUT /api/settings
```

Update system settings.

**Request Body:**
```json
{
  "donate_kofi": "https://ko-fi.com/newname",
  "donate_message": "New message"
}
```

**Response:**
```json
{
  "status": "updated",
  "count": 2
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid request body",
  "status": 400
}
```

### 401 Unauthorized

```json
{
  "error": "Not authenticated",
  "status": 401
}
```

### 404 Not Found

```json
{
  "error": "Game not found",
  "status": 404
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "status": 500
}
```

---

## Rate Limiting

Currently no rate limiting is enforced, but:

- External APIs (RAWG) have rate limits
- Large file operations may timeout
- Database queries may be slow with very large datasets

Future versions may implement rate limiting.

---

## Examples

### List PSP Games

```bash
curl https://yourdomain.com/api/games?platform=psp
```

### Create Queue Entry

```bash
curl -X POST https://yourdomain.com/api/queue \
  -H "Content-Type: application/json" \
  -d '{"gameId": 1}'
```

### Admin: Create Game

```bash
curl -X POST https://yourdomain.com/api/games \
  -H "Content-Type: application/json" \
  -b "gamehub_session=..." \
  -d '{
    "title": "New Game",
    "platformId": 1,
    "filePath": "/games/new.zip"
  }'
```

### Admin: Upload Cover

```bash
curl -X POST https://yourdomain.com/api/covers/upload \
  -b "gamehub_session=..." \
  -F "gameId=1" \
  -F "file=@cover.jpg"
```

---

## SDK / Client Libraries

Currently no official SDK. Integration options:

1. **Direct HTTP calls** - Use curl, axios, fetch
2. **Next.js** - Use built-in fetch or axios
3. **Python** - Use requests library
4. **JavaScript** - Use fetch API or axios

Example JavaScript:

```javascript
// Get games
const games = await fetch('/api/games').then(r => r.json());

// Create queue
const queue = await fetch('/api/queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gameId: 1 })
}).then(r => r.json());
```

---

Next: [Deployment Guide →](./06-deployment.md)
