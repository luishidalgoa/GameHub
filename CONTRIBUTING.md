# Contributing to GameHub 🤝

We love your input! GameHub is better because of contributors like you.

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our Code of Conduct:

- Be respectful and inclusive
- Welcome people of all backgrounds
- Focus on constructive feedback
- No harassment, discrimination, or hate speech
- Be patient and helpful with others

## How to Contribute

### Reporting Bugs

**Before submitting a bug report, please check the [issue list](../../issues) to avoid duplicates.**

When reporting bugs, include:

1. **Clear title** - Specific bug description
2. **Exact error message** - Copy the full error text
3. **Steps to reproduce** - How to make the bug happen
4. **Expected behavior** - What should happen instead
5. **Environment**:
   - Operating system (Windows, Linux, macOS)
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
6. **Screenshots** - If applicable
7. **Server logs** - From `pm2 logs gamehub` or console

**Example:**

```
**Title:** Admin login fails with SQLite database locked

**Error:**
```
SQLITE_BUSY: database is locked
```

**Steps to reproduce:**
1. Start server
2. Try to login to admin panel
3. See error immediately

**Expected:** Login should work

**Environment:**
- OS: Ubuntu 22.04
- Node: v18.17.0
- npm: 9.8.1
```

### Suggesting Features

We love feature ideas! Before suggesting, check if it's already requested.

When submitting a feature request, provide:

1. **Clear title** - Feature name
2. **Problem it solves** - Why you need this
3. **Proposed solution** - How it should work
4. **Alternative approaches** - Other ways to solve it
5. **Examples** - If it exists elsewhere, link it

**Example:**

```
**Title:** Add multi-user admin accounts

**Problem:** Currently only one admin password. Would like multiple accounts 
with audit trails.

**Proposed solution:**
- Admin table with username/password hashes
- Login form instead of password prompt
- Session tracking with user info
- Audit log of admin actions

**Alternatives:**
- Use reverse proxy for authentication
- Environment variable with multiple passwords

**Examples:**
- WordPress admin system
- MediaWiki admin accounts
```

### Submitting Code Changes

#### 1. Fork the Repository

```bash
# Click "Fork" on GitHub
git clone https://github.com/YOUR-USERNAME/GameHub.git
cd GameHub
```

#### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Use meaningful branch names:
- ✅ `feature/dark-mode`
- ✅ `fix/download-queue-bug`
- ✅ `docs/installation-guide`
- ❌ `work`, ❌ `fix`, ❌ `temp`

#### 3. Make Your Changes

**Code style guidelines:**

- Use **TypeScript** for new code
- Follow **ESLint** rules: `npm run lint`
- **No console.log in production code** (use proper logging)
- **Write meaningful variable names**
- **Add comments for complex logic**
- **Test your changes**

**Example:**

```typescript
// ✅ Good
function handleDownloadClick(gameId: number): void {
  const token = generateSecureToken()
  addToQueue(gameId, token)
}

// ❌ Bad
function h(gid) {
  let t = Math.random() // Not secure!
  q(gid, t)
}
```

#### 4. Test Your Changes

```bash
# Run linter
npm run lint

# Test locally
npm run dev

# Visit http://localhost:3000

# Check admin panel
# http://localhost:3000/admin/login
```

#### 5. Commit Your Changes

```bash
git add .
git commit -m "feat: add dark mode support"
```

**Commit message format:**

- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation
- **style:** Formatting (no code change)
- **refactor:** Code restructuring
- **test:** Adding tests
- **chore:** Maintenance

**Examples:**

```bash
git commit -m "feat: add game search functionality"
git commit -m "fix: queue status not updating"
git commit -m "docs: update installation guide"
git commit -m "refactor: improve metadata fetching"
```

#### 6. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

#### 7. Submit a Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in PR description:

```markdown
## Description
Brief description of changes

## Type
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Performance improvement

## Related Issues
Fixes #123

## Testing
How to test the changes:
1. Go to admin panel
2. Click "Scan"
3. Verify games appear

## Screenshots
If UI changes, add screenshots

## Checklist
- [x] Code follows style guidelines
- [x] Self-review completed
- [x] Comments added for complex logic
- [x] Documentation updated
- [x] No new warnings generated
- [x] Tests pass locally
```

### Documentation Improvements

Documentation is just as important as code!

#### Wiki Documentation

```bash
# Edit files in /wiki
nano wiki/01-installation.md

# Submit via pull request
git add wiki/
git commit -m "docs: improve installation guide"
git push origin feature/better-docs
```

#### Code Comments

```typescript
/**
 * Download a file and add it to queue
 * @param gameId - ID of game to download
 * @returns Queue token for polling status
 * @throws Error if game not found
 */
export async function queueDownload(gameId: number): Promise<string> {
  // Validate game exists
  const game = await db.game.findUnique({ where: { id: gameId } })
  if (!game) throw new Error('Game not found')

  // Generate secure token
  const token = generateSecureToken()

  // Add to queue
  await db.queueEntry.create({
    data: { token, gameId, status: 'waiting' },
  })

  return token
}
```

### Testing

Write tests for new features:

```typescript
// Example test (Jest)
describe('downloadQueue', () => {
  it('should create queue entry with valid game', async () => {
    const token = await queueDownload(1)
    expect(token).toBeDefined()
    expect(token.length).toBeGreaterThan(0)
  })

  it('should throw error for invalid game', async () => {
    expect(() => queueDownload(99999)).rejects.toThrow('Game not found')
  })
})
```

## Development Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your config

# Initialize database
npm run db:migrate
npm run seed

# Start development server
npm run dev

# Open browser to http://localhost:3000
```

### Available Scripts

```bash
npm run dev           # Start dev server with hot reload
npm run build         # Build for production
npm start             # Start production server
npm run lint          # Run ESLint
npm run db:migrate    # Run database migrations
npm run db:studio     # Open Prisma Studio
npm run scan          # Scan for games
npm run seed          # Seed initial data
```

## Project Structure

```
GameHub/
├── src/
│   ├── app/              # Next.js pages & API
│   ├── components/       # React components
│   ├── lib/              # Business logic
│   ├── types/            # TypeScript types
│   └── middleware.ts     # Authentication
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # DB migrations
├── wiki/                 # Documentation
├── public/               # Static assets
├── scripts/              # Build scripts
└── package.json          # Dependencies
```

## Coding Standards

### TypeScript

- Use strict types (avoid `any`)
- Export types for public APIs
- Use interfaces for objects
- Add return type annotations

```typescript
// ✅ Good
interface GameData {
  id: number
  title: string
  platform: string
}

export function getGame(id: number): Promise<GameData | null> {
  // Implementation
}

// ❌ Bad
export function getGame(id: any): any {
  // Implementation
}
```

### Components

- Functional components only
- Use React hooks
- Add JSDoc comments
- Keep components focused

```typescript
// ✅ Good
/**
 * Displays a game's details in a modal
 * @param gameId - ID of game to display
 * @param onClose - Callback when modal closes
 */
export function GameDetailModal({
  gameId,
  onClose,
}: {
  gameId: number
  onClose: () => void
}) {
  // Implementation
}
```

### Database

- Use Prisma for all database operations
- Create migrations for schema changes
- Use transactions for complex operations
- Add indexes for frequently queried fields

```typescript
// ✅ Good - Use Prisma
const game = await db.game.findUnique({
  where: { id: gameId },
  include: { platform: true, dlcs: true },
})

// ❌ Bad - Raw SQL
const game = await sql`SELECT * FROM game WHERE id = ${gameId}`
```

## Pull Request Review Process

1. **Automated Checks**
   - ESLint must pass
   - TypeScript must compile
   - Build must succeed

2. **Code Review**
   - At least 1 approval needed
   - Comments addressed before merge
   - Tests pass

3. **Merge**
   - Squash commits if needed
   - Delete branch after merge

## License

By contributing to GameHub, you agree that your contributions will be licensed under its ISC License.

## Recognition

Contributors are recognized in:
- README.md contributors section
- CHANGELOG.md
- GitHub contributors page

## Questions?

- 💬 GitHub Discussions - Ask questions
- 📖 Read the documentation
- 🐛 Check existing issues
- 📧 Check privacy policy for contact

---

Thank you for contributing to GameHub! 🎉

Together, we're making the best self-hosted game library system!
