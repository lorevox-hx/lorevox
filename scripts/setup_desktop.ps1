<#
.SYNOPSIS
    Lorevox Desktop Setup — Clone good repo + preserve local runtime assets
    Generated: 2026-04-06 | Phase Q.4 frozen green

.DESCRIPTION
    This script automates Parts 2–9 of the Git Cleanup work order:
    - Inventories existing desktop Lorevox folder
    - Backs up old folder before replacement
    - Fresh-clones from the good repo remote
    - Preserves and relinks desktop-local models, caches, .env, lorevox_data
    - Validates desktop startup readiness

    Run from an elevated PowerShell prompt on the DESKTOP machine.

.NOTES
    Source of truth: origin/main at https://github.com/lorevox-hx/lorevox.git
    Latest commit: 6412c02 (Phase Q.4 complete)
    Tag: q4-all-green-2026-04-06
#>

param(
    [string]$DesktopRoot = "$env:USERPROFILE",
    [string]$RepoName = "lorevox",
    [string]$RemoteURL = "https://github.com/lorevox-hx/lorevox.git",
    [string]$Branch = "main",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoPath = Join-Path $DesktopRoot $RepoName
$BackupPath = Join-Path $DesktopRoot "lorevox_old_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

function Write-Step { param([string]$Step, [string]$Message)
    Write-Host "`n=== [$Step] $Message ===" -ForegroundColor Cyan
}

function Write-Finding { param([string]$Label, [string]$Value)
    Write-Host "  $Label : $Value" -ForegroundColor Yellow
}

# ============================================================
# PART 2 — Inventory existing desktop setup
# ============================================================
Write-Step "PART 2" "Inventory existing desktop setup"

$inventory = @{
    RepoExists = $false
    GitHealthy = $false
    GitBranch = ""
    GitRemote = ""
    EnvExists = $false
    EnvPath = ""
    LorevoxDataExists = $false
    LorevoxDataPath = ""
    ModelPaths = @()
    CachePaths = @()
    LocalAssets = @()
}

if (Test-Path $RepoPath) {
    $inventory.RepoExists = $true
    Write-Finding "Repo found" $RepoPath

    # Check git health
    Push-Location $RepoPath
    try {
        $gitStatus = git status 2>&1
        if ($LASTEXITCODE -eq 0) {
            $inventory.GitHealthy = $true
            $inventory.GitBranch = (git branch --show-current 2>$null) ?? "unknown"
            $inventory.GitRemote = (git remote -v 2>$null | Select-Object -First 1) ?? "none"
            Write-Finding "Git healthy" "yes"
            Write-Finding "Branch" $inventory.GitBranch
            Write-Finding "Remote" $inventory.GitRemote
        } else {
            Write-Finding "Git healthy" "NO — $gitStatus"
        }
    } catch {
        Write-Finding "Git healthy" "NO — $($_.Exception.Message)"
    }
    Pop-Location

    # Check .env
    $envFile = Join-Path $RepoPath ".env"
    if (Test-Path $envFile) {
        $inventory.EnvExists = $true
        $inventory.EnvPath = $envFile
        Write-Finding ".env found" $envFile
    }

    # Scan for local assets worth preserving
    $localDirs = @("lorevox_data", "data", "models", "cache", "hf_home", ".huggingface")
    foreach ($dir in $localDirs) {
        $fullPath = Join-Path $RepoPath $dir
        if (Test-Path $fullPath) {
            $size = (Get-ChildItem $fullPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $sizeMB = [math]::Round($size / 1MB, 1)
            $inventory.LocalAssets += "$dir (${sizeMB}MB)"
            Write-Finding "Local asset" "$dir — ${sizeMB}MB"
        }
    }
} else {
    Write-Finding "Repo" "NOT FOUND at $RepoPath"
}

# Check common external data/model locations
$externalPaths = @(
    (Join-Path $DesktopRoot "lorevox_data"),
    "C:\lorevox_data",
    "C:\Llama-3.1-8B",
    (Join-Path $env:USERPROFILE ".cache\huggingface"),
    (Join-Path $env:USERPROFILE ".huggingface"),
    "C:\stories\models"
)

Write-Host "`n  Scanning external model/cache locations..." -ForegroundColor Gray
foreach ($p in $externalPaths) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 1)
        $sizeGB = [math]::Round($size / 1GB, 2)
        $inventory.ModelPaths += "$p (${sizeGB}GB)"
        Write-Finding "External asset" "$p — ${sizeGB}GB"
    }
}

# Check for lorevox_data specifically
$lorevoxDataCandidates = @(
    (Join-Path $DesktopRoot "lorevox_data"),
    "C:\lorevox_data",
    (Join-Path $RepoPath "lorevox_data")
)
foreach ($p in $lorevoxDataCandidates) {
    if (Test-Path $p) {
        $inventory.LorevoxDataExists = $true
        $inventory.LorevoxDataPath = $p
        Write-Finding "lorevox_data" $p
        break
    }
}

Write-Host "`n--- Inventory Complete ---" -ForegroundColor Green
Write-Host ($inventory | ConvertTo-Json -Depth 3)

if ($DryRun) {
    Write-Host "`n[DRY RUN] Stopping here. Review inventory above before running without -DryRun." -ForegroundColor Magenta
    exit 0
}

# ============================================================
# PART 3 — Back up existing Lorevox folder
# ============================================================
Write-Step "PART 3" "Back up existing desktop Lorevox folder"

if ($inventory.RepoExists) {
    Write-Host "  Renaming $RepoPath -> $BackupPath" -ForegroundColor Yellow

    # Copy .env out first if it exists (quick access later)
    $envBackup = Join-Path $DesktopRoot "lorevox_env_backup_$(Get-Date -Format 'yyyyMMdd').env"
    if ($inventory.EnvExists) {
        Copy-Item $inventory.EnvPath $envBackup -Force
        Write-Finding ".env backed up" $envBackup
    }

    try {
        Rename-Item $RepoPath $BackupPath -ErrorAction Stop
        Write-Finding "Backup" "SUCCESS -> $BackupPath"
    } catch {
        Write-Host "  Rename failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Attempting copy + rename..." -ForegroundColor Yellow
        # May fail if processes have locks; suggest user close everything
        Write-Host "  MANUAL ACTION: Close any editors, terminals, or processes using $RepoPath" -ForegroundColor Red
        Write-Host "  Then re-run this script." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Finding "Backup" "SKIPPED — no existing repo to back up"
}

# ============================================================
# PART 4 — Fresh clone
# ============================================================
Write-Step "PART 4" "Fresh clone from $RemoteURL"

Write-Host "  git clone $RemoteURL $RepoPath" -ForegroundColor Gray
git clone $RemoteURL $RepoPath
Push-Location $RepoPath
git checkout $Branch
git pull

Write-Host "`n  Verifying clone:" -ForegroundColor Gray
Write-Finding "Branch" (git branch --show-current)
Write-Finding "Remote" (git remote -v | Select-Object -First 1)
Write-Finding "Latest commit" (git log --oneline -1)
Write-Finding "Status" (git status --short)

$cloneHash = (git rev-parse HEAD).Substring(0, 7)
Pop-Location

# ============================================================
# PART 5 — Reuse existing models/caches
# ============================================================
Write-Step "PART 5" "Reuse existing desktop-local models and caches"

Write-Host "  Model/cache locations found during inventory:" -ForegroundColor Gray
foreach ($mp in $inventory.ModelPaths) {
    Write-Finding "Reusable" $mp
}

if ($inventory.ModelPaths.Count -eq 0) {
    Write-Host "  No pre-existing model/cache locations found." -ForegroundColor Yellow
    Write-Host "  Models will need to be downloaded on first run." -ForegroundColor Yellow
}

# ============================================================
# PART 6 — Align lorevox_data
# ============================================================
Write-Step "PART 6" "Recreate or align lorevox_data"

# Determine the best lorevox_data path
# The laptop .env uses /mnt/c/lorevox_data (WSL path = C:\lorevox_data on Windows)
$desktopDataPath = "C:\lorevox_data"

if ($inventory.LorevoxDataExists) {
    Write-Finding "Existing lorevox_data" $inventory.LorevoxDataPath
    if ($inventory.LorevoxDataPath -ne $desktopDataPath) {
        Write-Host "  NOTE: existing path differs from expected. Will use existing location." -ForegroundColor Yellow
        $desktopDataPath = $inventory.LorevoxDataPath
    }
    Write-Finding "Action" "REUSE existing data"
} else {
    Write-Host "  No existing lorevox_data found. Creating at $desktopDataPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $desktopDataPath -Force | Out-Null
    # Create expected subdirectories
    @("authors", "uploads", "media", "tts_cache") | ForEach-Object {
        New-Item -ItemType Directory -Path (Join-Path $desktopDataPath $_) -Force | Out-Null
    }
    Write-Finding "Action" "CREATED new lorevox_data at $desktopDataPath"
}

# Check if backup had lorevox_data content to copy
if ($inventory.RepoExists -and (Test-Path $BackupPath)) {
    $backupDataDir = Join-Path $BackupPath "lorevox_data"
    if (Test-Path $backupDataDir) {
        Write-Host "  Found lorevox_data in backup. Merging non-conflicting files..." -ForegroundColor Yellow
        # Copy only if destination doesn't already have the file
        Get-ChildItem $backupDataDir -Recurse -File | ForEach-Object {
            $relativePath = $_.FullName.Substring($backupDataDir.Length)
            $destPath = Join-Path $desktopDataPath $relativePath
            if (-not (Test-Path $destPath)) {
                $destDir = Split-Path $destPath -Parent
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                Copy-Item $_.FullName $destPath
                Write-Finding "Copied from backup" $relativePath
            }
        }
    }
}

# ============================================================
# PART 7 — Restore and validate .env
# ============================================================
Write-Step "PART 7" ".env restoration and validation"

$newEnvPath = Join-Path $RepoPath ".env"

# Decision: which .env to use?
# Priority: desktop backup .env > laptop .env from backup > generate from template
$envSource = "none"

if (Test-Path $envBackup -ErrorAction SilentlyContinue) {
    Write-Host "  Using backed-up desktop .env as base" -ForegroundColor Yellow
    Copy-Item $envBackup $newEnvPath -Force
    $envSource = "desktop backup"
} elseif ($inventory.RepoExists -and (Test-Path (Join-Path $BackupPath ".env"))) {
    Write-Host "  Using .env from old repo backup" -ForegroundColor Yellow
    Copy-Item (Join-Path $BackupPath ".env") $newEnvPath -Force
    $envSource = "old repo backup"
} else {
    Write-Host "  No existing .env found. You'll need to create one." -ForegroundColor Red
    Write-Host "  Copy from laptop and adjust paths. Key changes:" -ForegroundColor Yellow
    Write-Host "    - MODEL_PATH: adjust to desktop model location" -ForegroundColor Gray
    Write-Host "    - HF_HOME/TRANSFORMERS_CACHE: adjust to desktop cache" -ForegroundColor Gray
    Write-Host "    - DATA_DIR: adjust to desktop lorevox_data" -ForegroundColor Gray
    Write-Host "    - DB_PATH: adjust to desktop database location" -ForegroundColor Gray
    Write-Host "    - All /mnt/c/ paths need to match desktop WSL mount" -ForegroundColor Gray
    $envSource = "MANUAL — needs creation"
}

if (Test-Path $newEnvPath) {
    Write-Host "`n  .env validation:" -ForegroundColor Gray
    $envContent = Get-Content $newEnvPath -Raw

    # Check for critical paths
    $pathVars = @("MODEL_PATH", "MODEL_DIR", "HF_HOME", "DATA_DIR", "DB_PATH", "TTS_HOME", "UI_DIR")
    foreach ($var in $pathVars) {
        $match = [regex]::Match($envContent, "^$var=(.+)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
        if ($match.Success) {
            $val = $match.Groups[1].Value.Trim()
            # Convert WSL path to Windows for existence check
            $winPath = $val -replace "^/mnt/c/", "C:\" -replace "/", "\"
            $exists = Test-Path $winPath -ErrorAction SilentlyContinue
            $status = if ($exists) { "OK" } else { "MISSING" }
            Write-Finding "$var" "$val [$status]"
        }
    }
}

Write-Finding ".env source" $envSource

# ============================================================
# PART 8 — Compare laptop and desktop code state
# ============================================================
Write-Step "PART 8" "Compare laptop and desktop code state"

Push-Location $RepoPath
Write-Finding "Desktop branch" (git branch --show-current)
Write-Finding "Desktop remote" (git remote -v | Select-Object -First 1)
Write-Finding "Desktop HEAD" (git log --oneline -1)
Write-Finding "Desktop status" (& { $s = git status --short; if ($s) { $s } else { "clean" } })
Write-Host "`n  Laptop reference (from commit):" -ForegroundColor Gray
Write-Finding "Laptop branch" "main"
Write-Finding "Laptop remote" "https://github.com/lorevox-hx/lorevox.git"
Write-Finding "Laptop HEAD" "6412c02 Phase Q.4 complete"

$desktopHead = (git rev-parse HEAD).Substring(0, 7)
if ($desktopHead -eq "6412c02") {
    Write-Host "`n  MATCH: Desktop repo matches laptop repo" -ForegroundColor Green
} else {
    Write-Host "`n  MISMATCH: Desktop=$desktopHead Laptop=6412c02" -ForegroundColor Red
    Write-Host "  Run 'git pull' to sync" -ForegroundColor Yellow
}
Pop-Location

# ============================================================
# PART 9 — Verify desktop startup readiness
# ============================================================
Write-Step "PART 9" "Verify desktop startup readiness"

$readiness = @{
    RepoAligned = ($desktopHead -eq $cloneHash)
    EnvValid = (Test-Path $newEnvPath)
    LorevoxDataFound = (Test-Path $desktopDataPath)
    StatusScriptExists = (Test-Path (Join-Path $RepoPath "scripts\status_all.sh"))
    StartScriptExists = (Test-Path (Join-Path $RepoPath "start_lorevox.bat"))
}

# Check model paths from .env
$modelPathOk = $false
if (Test-Path $newEnvPath) {
    $envContent = Get-Content $newEnvPath -Raw
    $modelMatch = [regex]::Match($envContent, "^MODEL_PATH=(.+)$", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if ($modelMatch.Success) {
        $winPath = $modelMatch.Groups[1].Value.Trim() -replace "^/mnt/c/", "C:\" -replace "/", "\"
        $modelPathOk = Test-Path $winPath -ErrorAction SilentlyContinue
    }
}
$readiness.ModelPathResolves = $modelPathOk

foreach ($k in $readiness.Keys | Sort-Object) {
    $status = if ($readiness[$k]) { "PASS" } else { "FAIL" }
    $color = if ($readiness[$k]) { "Green" } else { "Red" }
    Write-Host "  $k : $status" -ForegroundColor $color
}

$failures = ($readiness.Values | Where-Object { -not $_ }).Count
if ($failures -eq 0) {
    Write-Host "`n  DESKTOP STARTUP READY" -ForegroundColor Green
} else {
    Write-Host "`n  $failures check(s) failed — see above" -ForegroundColor Red
}

# ============================================================
# PART 10 — Summary report
# ============================================================
Write-Step "PART 10" "Final Summary"

Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║  LOREVOX DESKTOP SETUP REPORT                              ║
╠══════════════════════════════════════════════════════════════╣
║  1. Desktop inventory: $(if ($inventory.RepoExists) { "Old repo found + backed up" } else { "No existing repo" })
║  2. Backup: $BackupPath
║  3. Clone: $RemoteURL -> $RepoPath
║  4. Branch: $Branch | HEAD: $cloneHash
║  5. lorevox_data: $desktopDataPath
║  6. .env source: $envSource
║  7. Model paths: $(if ($modelPathOk) { "RESOLVED" } else { "NEEDS ATTENTION" })
║  8. Readiness: $(if ($failures -eq 0) { "ALL PASS" } else { "$failures FAILED" })
╚══════════════════════════════════════════════════════════════╝

Next steps:
  1. If .env needs editing, adjust machine-specific paths
  2. Run: wsl bash /mnt/c/Users/$env:USERNAME/lorevox/scripts/status_all.sh
  3. Start Lorevox: .\start_lorevox.bat  (or Desktop\Lori\Start Lori.bat)

"@

Write-Host "Setup complete." -ForegroundColor Green
