# GameHub Wiki 📚

Complete documentation for the GameHub game library management system.

## Table of Contents

### Getting Started
1. **[Installation Guide](./01-installation.md)** 🚀
   - Prerequisites and system requirements
   - Step-by-step installation
   - Initial configuration
   - Verification checklist

2. **[Configuration Guide](./02-configuration.md)** ⚙️
   - Environment variables
   - Database configuration
   - Admin authentication
   - Security setup
   - Performance tuning

### Usage
3. **[Game Management](./03-game-management.md)** 🎮
   - Adding games (auto-scan & manual)
   - Managing metadata
   - Organizing by platform
   - DLC and updates
   - Cover images

4. **[Admin Panel Guide](./04-admin-panel.md)** 👨‍💼
   - Dashboard overview
   - Game management tools
   - Scanning and discovery
   - Settings and configuration
   - Analytics and donations
   - Troubleshooting admin issues

### Integration & API
5. **[API Reference](./05-api-reference.md)** 🔌
   - Complete endpoint documentation
   - Public and admin endpoints
   - Authentication
   - Request/response examples
   - Error handling
   - Code examples

### Deployment & Operations
6. **[Deployment Guide](./06-deployment.md)** 🚀
   - Vercel (easiest)
   - Docker deployment
   - Self-hosted VPS
   - NAS deployment
   - Cloud platforms (AWS, Azure)
   - Post-deployment checklist
   - Performance optimization

7. **[Troubleshooting Guide](./07-troubleshooting.md)** 🐛
   - Installation issues
   - Database problems
   - Server errors
   - Configuration problems
   - Game management issues
   - Frontend bugs
   - Download issues
   - Network problems
   - Getting help

---

## Quick Links

### For New Users
- 👶 **Just starting?** → [Installation Guide](./01-installation.md)
- ⚙️ **Setup problems?** → [Configuration Guide](./02-configuration.md)
- 🐛 **Something broken?** → [Troubleshooting](./07-troubleshooting.md)

### For Administrators
- 🎮 **Add games to library** → [Game Management](./03-game-management.md)
- 👨‍💼 **Manage admin panel** → [Admin Panel Guide](./04-admin-panel.md)
- 📊 **View analytics** → [Admin Panel Guide - Traffic Analytics](./04-admin-panel.md#traffic-analytics)

### For Developers
- 🔌 **Integrate with API** → [API Reference](./05-api-reference.md)
- 🚀 **Deploy to production** → [Deployment Guide](./06-deployment.md)
- 🐳 **Use Docker** → [Deployment - Docker](./06-deployment.md#option-2-docker)

### For Operators
- 🖥️ **Self-host setup** → [Deployment - VPS](./06-deployment.md#option-3-self-hosted-vps)
- 💾 **Backup strategy** → [Deployment - Backup](./06-deployment.md#setup-backup)
- 🔒 **Security hardening** → [Configuration - Security](./02-configuration.md#security-configuration)

---

## FAQ

### Can I run GameHub at home?
Yes! It's perfect for home labs. See [NAS Deployment](./06-deployment.md#option-4-nas-synology-qnap-etc).

### How much storage do I need?
Just enough for your game library plus ~500MB for the app. SQLite database is tiny.

### Can I share my library with others?
Yes, by deploying to a server or sharing your local IP. No built-in user accounts yet.

### Is it free?
Yes, GameHub is open-source and free to use.

### Can I backup my games?
Yes, the SQLite database stores metadata. Games files are separate.

### How do I update GameHub?
```bash
git pull
npm install
npm run build
npm start
```

### Can I use a different database?
Currently SQLite only. PostgreSQL support planned for future versions.

### Does it work on Windows?
Yes! Follow installation guide on Windows PowerShell or WSL.

### Can I run multiple instances?
Not recommended with single SQLite database. Use Docker/separate servers.

### What file formats are supported?
Any format works! The scanner treats everything as a valid game file.

---

## Common Tasks

### Add a game quickly
1. Place file in a folder
2. Go to Admin → Scan
3. Add folder path
4. Click "Start Scan"
5. Done!

### Change admin password
1. Edit `.env.local`
2. Change `ADMIN_PASSWORD`
3. Restart server

### Backup your data
```bash
cp gamehub.db gamehub.db.backup
```

### Transfer to another computer
1. Copy entire `GameHub` folder
2. Copy `gamehub.db` file
3. Run `npm install`
4. Start server

---

## Documentation Standards

All documentation follows these conventions:

- **Code blocks** show actual commands to run
- **File paths** shown as `/path/to/file` (use your actual paths)
- **Examples** show realistic scenarios
- **⚠️ Warnings** highlight destructive operations
- **Links** go to relevant sections
- **Bold text** highlights important concepts

---

## Contributing to Docs

Found an error or want to improve docs?

1. Fork the repository
2. Make changes to files in `/wiki`
3. Submit pull request
4. We'll review and merge!

---

## Getting Help

1. **Search the docs** - Most questions answered here
2. **Check Troubleshooting** - Common issues and solutions
3. **Search GitHub Issues** - Someone might have same problem
4. **Create GitHub Issue** - Ask the community
5. **Join discussions** - Share ideas and ask questions

---

## Version History

**Latest: v1.0.0**

Documentation updated regularly. Last updated: May 2026

---

**Let's get started!** → [Installation Guide](./01-installation.md)
