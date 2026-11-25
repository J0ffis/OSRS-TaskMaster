<#
  One-off snapshot of collection log drop rates from the OSRS Wiki.

  Run this by hand after big game updates; the site never contacts the wiki itself.
  It asks only about collection log items, in batches, with a pause between requests.

    .\scripts\fetch-drop-rates.ps1                     # uses the newest synced profile for item names
    .\scripts\fetch-drop-rates.ps1 -Profile path.json  # or a specific profile

  Output: web/data/drop-rates.json. Data from the OSRS Wiki, licensed CC BY-NC-SA 3.0.
#>
param(
  [string]$Profile,
  [int]$BatchSize = 60,
  [int]$PauseMs = 1500
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ua = "OSRS-TaskMaster/0.1 (personal collection log planner; one-off drop-rate snapshot)"
$api = "https://oldschool.runescape.wiki/api.php"

if (-not $Profile) {
  $Profile = Get-ChildItem (Join-Path $root "server\data\profiles") -Filter *.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Profile -or -not (Test-Path $Profile)) { throw "No synced profile found. Sync once from RuneLite first." }

# Every collection log item name the game knows about.
$snap = Get-Content $Profile -Raw -Encoding UTF8 | ConvertFrom-Json
$names = @($snap.collectionLog.pages.PSObject.Properties | ForEach-Object { $_.Value.items | ForEach-Object { $_.name } } | Where-Object { $_ } | Sort-Object -Unique)
if (-not $names.Count) { throw "That profile has no collection log pages. Update the plugin and sync again." }
Write-Host "Looking up $($names.Count) collection log items in batches of $BatchSize..."

# "1/512", "12/128", "1/5,000", "~1/64", "2.5/128" -> probability; words like "Always" too.
function ConvertTo-Probability([string]$r) {
  if (-not $r) { return $null }
  $s = $r.Replace(',', '').Replace('~', '').Trim()
  if ($s -match '^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$') { return [double]$matches[1] / [double]$matches[2] }
  switch -regex ($s) { '^Always$' { return 1.0 } }
  return $null
}

$items = [ordered]@{}
$requests = 0
for ($i = 0; $i -lt $names.Count; $i += $BatchSize) {
  $batch = $names[$i..([Math]::Min($i + $BatchSize, $names.Count) - 1)]
  # Double-quoted strings so names like "Ahrim's hood" need no escaping.
  $ors = ($batch | ForEach-Object { '{"item_name","' + $_.Replace('"', '\"') + '"}' }) -join ','
  $q = "bucket('dropsline').select('page_name','item_name','drop_json').where(bucket.Or($ors)).limit(5000).run()"
  $res = Invoke-WebRequest -UseBasicParsing -Uri "$api`?action=bucket&format=json&query=$([uri]::EscapeDataString($q))" -Headers @{ 'User-Agent' = $ua }
  $requests++
  $json = $res.Content | ConvertFrom-Json
  if ($json.error) { throw "Wiki query failed: $($json.error)" }
  foreach ($row in $json.bucket) {
    $d = $row.drop_json | ConvertFrom-Json
    $p = ConvertTo-Probability $d.Rarity
    $from = ($d.'Dropped from', $row.page_name | Where-Object { $_ } | Select-Object -First 1) -replace '#.*$', ''
    $entry = [ordered]@{ from = $from; rarity = $d.Rarity; p = $p; rolls = [int]($d.Rolls | ForEach-Object { if ($_) { $_ } else { 1 } }); type = $d.'Drop type' }
    if (-not $items.Contains($row.item_name)) { $items[$row.item_name] = New-Object System.Collections.ArrayList }
    # Skip duplicate rows (same source and rarity, e.g. different locations).
    if (-not ($items[$row.item_name] | Where-Object { $_.from -eq $entry.from -and $_.rarity -eq $entry.rarity })) { [void]$items[$row.item_name].Add($entry) }
  }
  Write-Host ("  batch {0}/{1}: {2} rows" -f ($requests), [Math]::Ceiling($names.Count / $BatchSize), $json.bucket.Count)
  Start-Sleep -Milliseconds $PauseMs
}

$out = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  source = 'OSRS Wiki (oldschool.runescape.wiki), CC BY-NC-SA 3.0'
  requests = $requests
  items = $items
}
$dir = Join-Path $root 'web\data'
New-Item -ItemType Directory -Force $dir | Out-Null
$path = Join-Path $dir 'drop-rates.json'
[IO.File]::WriteAllText($path, ($out | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding($false)))
$missing = @($names | Where-Object { -not $items.Contains($_) })
Write-Host "Saved $($items.Count) items with rates to web\data\drop-rates.json using $requests requests."
Write-Host "$($missing.Count) items have no drop rows (points shops, guaranteed rewards, quest items and the like)."
