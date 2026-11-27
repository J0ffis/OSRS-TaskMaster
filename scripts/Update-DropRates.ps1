<#
  Snapshot of collection log drop rates from the OSRS Wiki, kept in web/data/drop-rates.json.

  Run this by hand after game updates; the site never contacts the wiki itself.
  By default it only asks the wiki about items the file doesn't cover yet (new collection log
  items), so a re-run usually sends no requests at all. Requests go in batches, with a pause
  between them.

    .\scripts\Update-DropRates.ps1                     # new items only, names from the newest synced profile
    .\scripts\Update-DropRates.ps1 -Profile path.json  # or names from a specific profile
    .\scripts\Update-DropRates.ps1 -DryRun             # say what would be looked up; contact nothing
    .\scripts\Update-DropRates.ps1 -RecheckNoDrops     # also re-ask about items the wiki had no drops for
    .\scripts\Update-DropRates.ps1 -Full               # re-ask about everything (e.g. after a drop table rework)

  The file records two lists: `items` (names with drop rows) and `noDrops` (names the wiki was
  asked about and had no drop rows for: points shops, guaranteed rewards, quest items). Anything
  in either list counts as already looked up.

  Data from the OSRS Wiki, licensed CC BY-NC-SA 3.0.
#>
param(
  [string]$Profile,
  [switch]$Full,
  [switch]$RecheckNoDrops,
  [switch]$DryRun,
  [int]$BatchSize = 60,
  [int]$PauseMs = 1500
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Format-Json.ps1')   # provides Format-JsonText
$root = Split-Path $PSScriptRoot -Parent
$ua = "OSRS-TaskMaster/0.1 (personal collection log planner; one-off drop-rate snapshot)"
$api = "https://oldschool.runescape.wiki/api.php"
$path = Join-Path $root 'web\data\drop-rates.json'

if (-not $Profile) {
  $Profile = Get-ChildItem (Join-Path $root "server\data\profiles") -Filter *.json -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Profile -or -not (Test-Path $Profile)) { throw "No synced profile found. Sync once from RuneLite first, or pass -Profile." }

# Every collection log item name the game knows about.
$snap = Get-Content $Profile -Raw -Encoding UTF8 | ConvertFrom-Json
$names = @($snap.collectionLog.pages.PSObject.Properties | ForEach-Object { $_.Value.items | ForEach-Object { $_.name } } | Where-Object { $_ } | Sort-Object -Unique)
if (-not $names.Count) { throw "That profile has no collection log pages. Update the plugin and sync again." }

# ---- What the file already covers -------------------------------------------------------
# The wiki and the game don't always capitalise names the same way, so compare ignoring case.
$items = [ordered]@{}
$noDrops = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$lastFull = $null
$totalRequests = 0
if (-not $Full -and (Test-Path $path)) {
  $old = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  foreach ($p in $old.items.PSObject.Properties) { $items[$p.Name] = New-Object System.Collections.ArrayList(, @($p.Value)) }
  foreach ($n in @($old.noDrops)) { if ($n) { [void]$noDrops.Add($n) } }
  # Older files have no lastFullRefresh: their `generated` time was a full run.
  $lastFull = if ($old.lastFullRefresh) { $old.lastFullRefresh } else { $old.generated }
  $totalRequests = if ($old.totalRequests) { [int]$old.totalRequests } else { [int]$old.requests }
}
$known = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($k in $items.Keys) { [void]$known.Add($k) }
if (-not $RecheckNoDrops) { foreach ($n in $noDrops) { [void]$known.Add($n) } }

$todo = @($names | Where-Object { -not $known.Contains($_) })
$mode = if ($Full) { 'full refresh' } elseif ($RecheckNoDrops) { 'new items + recheck no-drop items' } else { 'new items only' }
Write-Host ("{0} collection log items in the profile; {1} need looking up ({2})." -f $names.Count, $todo.Count, $mode)
if (-not $todo.Count) { Write-Host "Nothing to look up; web\data\drop-rates.json is unchanged and the wiki was not contacted."; return }
$batches = [Math]::Ceiling($todo.Count / $BatchSize)
if ($DryRun) {
  Write-Host "Dry run: would send $batches request(s) to the wiki for:"
  $todo | ForEach-Object { Write-Host "  $_" }
  return
}

# "1/512", "12/128", "1/5,000", "~1/64", "2.5/128" -> probability; words like "Always" too.
function ConvertTo-Probability([string]$r) {
  if (-not $r) { return $null }
  $s = $r.Replace(',', '').Replace('~', '').Trim()
  if ($s -match '^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$') { return [double]$matches[1] / [double]$matches[2] }
  switch -regex ($s) { '^Always$' { return 1.0 } }
  return $null
}

# ---- Ask the wiki -----------------------------------------------------------------------
$requests = 0
for ($i = 0; $i -lt $todo.Count; $i += $BatchSize) {
  $batch = $todo[$i..([Math]::Min($i + $BatchSize, $todo.Count) - 1)]
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
  Write-Host ("  batch {0}/{1}: {2} rows" -f $requests, $batches, @($json.bucket).Count)
  if ($requests -lt $batches) { Start-Sleep -Milliseconds $PauseMs }
}

# Names the wiki had nothing for are remembered, so the next run doesn't ask again.
$found = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($k in $items.Keys) { [void]$found.Add($k) }
$newNoDrops = @($todo | Where-Object { -not $found.Contains($_) })
foreach ($n in $newNoDrops) { [void]$noDrops.Add($n) }
foreach ($n in @($noDrops)) { if ($found.Contains($n)) { [void]$noDrops.Remove($n) } }   # the wiki has rows for it now

$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$out = [ordered]@{
  generated = $now
  lastFullRefresh = if ($Full -or -not $lastFull) { $now } else { $lastFull }
  source = 'OSRS Wiki (oldschool.runescape.wiki), CC BY-NC-SA 3.0'
  requests = $requests                          # sent by the latest run
  totalRequests = $totalRequests + $requests    # since the last full refresh
  items = $items
  noDrops = @($noDrops | Sort-Object)
}
New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
[IO.File]::WriteAllText($path, (Format-JsonText ($out | ConvertTo-Json -Depth 6 -Compress)), (New-Object Text.UTF8Encoding($false)))
Write-Host ("Looked up {0} items in {1} request(s): {2} had drop rows, {3} had none (points shops, guaranteed rewards, quest items and the like)." -f $todo.Count, $requests, ($todo.Count - $newNoDrops.Count), $newNoDrops.Count)
Write-Host "web\data\drop-rates.json now covers $($items.Count) items with rates and $($noDrops.Count) without."
