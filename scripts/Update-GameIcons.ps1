<#
  Exports the game icons the website shows into web/icons/game, from the OSRS game cache that
  RuneLite keeps on this PC. Nothing is downloaded from the internet except, on the first run,
  RuneLite's cache-reading library (from repo.runelite.net, like the plugin's own build).

    .\scripts\Update-GameIcons.ps1                 # reads %USERPROFILE%\.runelite\jagexcache\oldschool\LIVE
    .\scripts\Update-GameIcons.ps1 -Cache <dir>    # another copy of the cache

  Run it by hand after a game update that adds collection log items or changes icons, then
  commit web/icons/game. The website only ever loads these local copies.

  What's exported: the PvP skull, skill icons, category icons (quests, diaries, collection
  log), combat achievement tier swords, and an icon for every collection log item listed in
  tests/fixtures/game-names.json (refresh that first with `npm run game-names` when the game
  adds items). Game images © Jagex Ltd., used for this free, non-commercial fan tool.
#>
param(
  [string]$Cache = (Join-Path $env:USERPROFILE '.runelite\jagexcache\oldschool\LIVE')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path (Join-Path $Cache 'main_file_cache.dat2'))) {
  throw "No game cache found in $Cache. Start RuneLite once (it downloads the cache), or pass -Cache."
}

# The same private Java 17 the other scripts use, if there's no JAVA_HOME.
if (-not $env:JAVA_HOME) {
  $jdk = Join-Path $env:LOCALAPPDATA 'Programs\jdk17'
  if (Test-Path (Join-Path $jdk 'bin\java.exe')) { $env:JAVA_HOME = $jdk }
}

$out = Join-Path $root 'web\icons\game'
$items = Join-Path $root 'tests\fixtures\game-names.json'
$gradlew = Join-Path $root 'plugin\gradlew.bat'
$project = Join-Path $root 'tools\game-icons'

# Start clean so icons the game removed don't linger.
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

& $gradlew -p $project run --console=plain -q --args="--cache `"$Cache`" --out `"$out`" --items `"$items`""
if ($LASTEXITCODE -ne 0) { throw "Exporting icons failed (exit code $LASTEXITCODE)." }

$count = (Get-ChildItem (Join-Path $out 'items') -Filter *.png).Count
$size = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum) / 1KB)
Write-Host "web\icons\game now holds $count item icons plus sprites ($size KB in all)."
