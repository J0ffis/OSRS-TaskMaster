<#
  One command to bring the website's game data up to date after a game update:

    1. Game names    tests/fixtures/game-names.json   collection log pages and items, quests,
                                                       diaries, combat achievements
    2. Game icons    web/icons/game                    from the game cache on this PC
    3. Drop rates    web/data/drop-rates.json          new items only, from the OSRS Wiki
    4. Quest reqs    web/data/quest-reqs.json          only if there are new quests, from the OSRS Wiki
    5. Checks        npm run check + npm test

  Then it lists what changed. "Nothing new" means there's nothing to commit; otherwise review
  the changes, commit them and push to main, which republishes the website.

  The wiki is only asked about things the files don't cover yet, so after a game update with
  nothing new it isn't contacted at all.

    .\scripts\Update-GameData.ps1                    # everything
    .\scripts\Update-GameData.ps1 -DryRun            # wiki steps: say what would be looked up, contact nothing
    .\scripts\Update-GameData.ps1 -Full              # wiki steps: re-ask about everything (e.g. after a drop table rework)
    .\scripts\Update-GameData.ps1 -SkipDropRates -SkipQuestReqs   # names, icons and checks only (no wiki contact)
    .\scripts\Update-GameData.ps1 -Profile <file>    # read game names from this profile file
    .\scripts\Update-GameData.ps1 -Cache <dir>       # another copy of the game cache

  Before running: log in once with the plugin after the game update (so the saved profile and
  RuneLite's game cache are current). The profile used is the newest one the plugin saved in
  %USERPROFILE%\.runelite\osrs-taskmaster (or one synced to the local server).
#>
param(
  [string]$Profile,
  [string]$Cache = (Join-Path $env:USERPROFILE '.runelite\jagexcache\oldschool\LIVE'),
  [switch]$SkipIcons,
  [switch]$SkipDropRates,
  [switch]$SkipQuestReqs,
  [switch]$DryRun,
  [switch]$Full
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Find-Tool([string]$name, [string[]]$fallbacks) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($f in $fallbacks) { if (Test-Path $f) { return $f } }
  return $null
}
$node = Find-Tool 'node' @((Join-Path $env:LOCALAPPDATA 'Programs\node\node.exe'))
if (-not $node) { throw "Node.js wasn't found. Install it from https://nodejs.org/ (no packages needed)." }
$git = Find-Tool 'git' @('C:\Program Files\Git\cmd\git.exe', (Join-Path $env:LOCALAPPDATA 'Atlassian\SourceTree\git_local\bin\git.exe'))

function Step([string]$title) { Write-Host ''; Write-Host "== $title" -ForegroundColor Cyan }

# ---- 1. Which profile ---------------------------------------------------------------------
if (-not $Profile) {
  $candidates = @(
    Get-ChildItem (Join-Path $env:USERPROFILE '.runelite\osrs-taskmaster') -Filter *.json -ErrorAction SilentlyContinue
    Get-ChildItem (Join-Path $root 'server\data\profiles') -Filter *.json -ErrorAction SilentlyContinue
  ) | Sort-Object LastWriteTime -Descending
  if (-not $candidates) { throw "No profile found. In RuneLite, open the OSRS TaskMaster panel and click Copy my profile once, or pass -Profile." }
  $Profile = $candidates[0].FullName
}
$age = (Get-Date) - (Get-Item $Profile).LastWriteTime
Write-Host "Profile: $Profile (saved $([math]::Round($age.TotalDays, 1)) days ago)"
if ($age.TotalDays -gt 7) { Write-Host "  It's over a week old: log in with the plugin after the game update for the newest names." -ForegroundColor Yellow }

# ---- 2. Game names --------------------------------------------------------------------------
Step 'Game names'
& $node (Join-Path $root 'tests\make-game-names.mjs') $Profile
if ($LASTEXITCODE -ne 0) { throw 'Reading game names failed.' }

# ---- 3. Game icons --------------------------------------------------------------------------
if ($SkipIcons) { Step 'Game icons (skipped)' } else {
  Step 'Game icons'
  & (Join-Path $PSScriptRoot 'Update-GameIcons.ps1') -Cache $Cache
}

# ---- 4. Drop rates --------------------------------------------------------------------------
if ($SkipDropRates) { Step 'Drop rates (skipped)' } else {
  Step ($(if ($DryRun) { 'Drop rates (dry run)' } else { 'Drop rates' }))
  & (Join-Path $PSScriptRoot 'Update-DropRates.ps1') -Profile $Profile -DryRun:$DryRun -Full:$Full
}

# ---- 5. Quest requirements ------------------------------------------------------------------
if ($SkipQuestReqs) { Step 'Quest requirements (skipped)' } else {
  Step ($(if ($DryRun) { 'Quest requirements (dry run)' } else { 'Quest requirements' }))
  $qargs = @((Join-Path $root 'scripts\update-quest-reqs.mjs'))
  if ($DryRun) { $qargs += '--dry-run' }
  if ($Full) { $qargs += '--full' }
  & $node @qargs
  if ($LASTEXITCODE -ne 0) { throw 'Updating quest requirements failed.' }
}

# ---- 6. Checks ------------------------------------------------------------------------------
Step 'Checks'
& $node (Join-Path $root 'tests\check-knowledge-base.mjs')
$checkOk = $LASTEXITCODE -eq 0
& $node --test --test-reporter=dot 'tests/*.test.mjs'
$testsOk = $LASTEXITCODE -eq 0

# ---- 7. What changed ------------------------------------------------------------------------
Step 'What changed'
$paths = @('tests/fixtures/game-names.json', 'web/icons/game', 'web/data/drop-rates.json', 'web/data/quest-reqs.json')
if ($git) {
  $changes = @(& $git status --porcelain -- @paths)
  if (-not $changes) {
    Write-Host 'Nothing new: the game data is already up to date. Nothing to commit.' -ForegroundColor Green
  } else {
    $icons = @($changes | Where-Object { $_ -match 'web/icons/game/items/' })
    $other = @($changes | Where-Object { $_ -notmatch 'web/icons/game/items/' })
    if ($icons) { Write-Host "  $($icons.Count) item icon(s) added or changed" }
    $other | ForEach-Object { Write-Host "  $_" }
    Write-Host 'Review these, then commit and push to main to republish the website.' -ForegroundColor Yellow
  }
} else {
  Write-Host "Git wasn't found, so changes can't be listed. Check $($paths -join ', ') yourself."
}

if (-not ($checkOk -and $testsOk)) {
  Write-Host ''
  Write-Host 'Checks failed: fix the errors above before committing.' -ForegroundColor Red
  exit 1
}
