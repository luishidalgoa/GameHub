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

            'export' {
                if (-not (Test-Path $DB_PATH)) { Write-Err "No database found at $DB_PATH" }
                $timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
                $dest      = ".\gamehub_backup_$timestamp.db"
                Copy-Item $DB_PATH $dest
                Write-Ok "Exported to $dest"
            }

            'import' {
                $candidates = Get-ChildItem -Path "." -Filter "*.db" | Where-Object { $_.Name -ne "gamehub.db" }
                if ($candidates.Count -eq 0) { Write-Err "No .db files found in current directory." }

                Write-Host ""
                Write-Host "Available databases:"
                for ($i = 0; $i -lt $candidates.Count; $i++) {
                    Write-Host "  [$($i+1)] $($candidates[$i].Name)"
                }
                Write-Host ""
                $choice = Read-Host "Select number"
                $index  = [int]$choice - 1

                if ($index -lt 0 -or $index -ge $candidates.Count) { Write-Err "Invalid selection." }
                $selected = $candidates[$index].FullName

                if (Test-Path $DB_PATH) {
                    $backupPath = "$DB_PATH.bak"
                    Copy-Item $DB_PATH $backupPath -Force
                    Write-Ok "Existing DB backed up to gamehub.db.bak"
                }

                Copy-Item $selected $DB_PATH -Force
                Write-Ok "Imported $($candidates[$index].Name) → $DB_PATH"
                Write-Ok "Run '.\local.ps1 db migrate' to apply any pending migrations."
            }

            default {
                Write-Host ""
                Write-Host "Usage: .\local.ps1 db <subcommand>"
                Write-Host ""
                Write-Host "  migrate   apply pending Prisma migrations"
                Write-Host "  reset     drop and recreate the database (destructive!)"
                Write-Host "  studio    open Prisma Studio in browser"
                Write-Host "  export    backup gamehub.db to current folder"
                Write-Host "  import    replace gamehub.db from a .db file here"
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
        Write-Host "  db export        backup gamehub.db to current folder"
        Write-Host "  db import        replace gamehub.db from a .db file here"
    }
}
