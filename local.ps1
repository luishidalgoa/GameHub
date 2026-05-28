# GameHub — local development helper (Windows)
# Requires: Node.js, npm
#
# Usage:
#   .\local.ps1 dev          # start Next.js dev server
#   .\local.ps1 build        # production build
#   .\local.ps1 db migrate   # run pending migrations
#   .\local.ps1 db reset     # reset DB (drops all data!)
#   .\local.ps1 db studio    # open Prisma Studio
#   .\local.ps1 db export    # backup gamehub.db to current folder
#   .\local.ps1 db import    # replace gamehub.db from a .db file in current folder

param(
    [Parameter(Position=0)]
    [ValidateSet('dev','build','db','help')]
    [string]$Command = 'help',

    [Parameter(Position=1)]
    [string]$SubCommand = ''
)

$DB_PATH    = "$PSScriptRoot\prisma\gamehub.db"
$ENV_FILE   = "$PSScriptRoot\.env"

function Write-Ok($msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

# Load .env into current process so Node/Prisma picks them up
function Load-Env {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Warn ".env not found — using system environment variables"
        return
    }
    Get-Content $ENV_FILE | Where-Object { $_ -match '^\s*[^#]' -and $_ -match '=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
    Write-Ok "Loaded environment from .env"
}

switch ($Command) {

    'dev' {
        Load-Env
        Write-Ok "Running database migrations..."
        npx prisma migrate deploy
        Write-Ok "Starting dev server → http://localhost:3000"
        npm run dev
    }

    'build' {
        Load-Env
        Write-Ok "Generating Prisma client..."
        npx prisma generate
        Write-Ok "Building Next.js..."
        npm run build
        Write-Ok "Build complete."
    }

    'db' {
        switch ($SubCommand) {

            'migrate' {
                Load-Env
                Write-Ok "Applying pending migrations..."
                npx prisma migrate deploy
            }

            'reset' {
                Write-Warn "This will DELETE all data in gamehub.db. Are you sure? (y/N)"
                $confirm = Read-Host
                if ($confirm -ne 'y') { Write-Warn "Aborted."; exit 0 }
                Load-Env
                npx prisma migrate reset --force
                Write-Ok "Database reset complete."
            }

            'studio' {
                Load-Env
                Write-Ok "Opening Prisma Studio → http://localhost:5555"
                npx prisma studio
            }

            default {
                Write-Host ""
                Write-Host "Usage: .\local.ps1 db <subcommand>"
                Write-Host ""
                Write-Host "  migrate   apply pending Prisma migrations"
                Write-Host "  reset     drop and recreate the database (destructive!)"
                Write-Host "  studio    open Prisma Studio in browser"
                Write-Host ""
                Write-Host "  Export / import (with path remapping) are npm scripts:"
                Write-Host "    npm run db:export"
                Write-Host "    npm run db:import"
            }
        }
    }

    default {
        Write-Host ""
        Write-Host "Usage: .\local.ps1 <command>"
        Write-Host ""
        Write-Host "  dev              start Next.js dev server"
        Write-Host "  build            production build"
        Write-Host "  db migrate       apply pending migrations"
        Write-Host "  db reset         reset database (destructive!)"
        Write-Host "  db studio        open Prisma Studio"
        Write-Host ""
        Write-Host "  DB export/import (with path remapping) are npm scripts:"
        Write-Host "    npm run db:export   ·   npm run db:import"
    }
}
