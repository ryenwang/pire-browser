param(
  [string]$CsvPath = "C:\Users\wangr\bloxpi\examples\Games\RBXLX Files\download_list.csv",
  [string]$TargetDir = "C:\Users\wangr\bloxpi\examples\Games\RBXLX Files",
  [string]$DownloadDir = (Join-Path $env:USERPROFILE "Downloads"),
  [string]$PirePath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "target\debug\pire-browser.exe"),
  [int]$Limit = 0,
  [int]$PageTimeoutSeconds = 3,
  [int]$DownloadTimeoutMinutes = 45,
  [switch]$StopOnError,
  [switch]$IncludeDownloadedDuplicates
)

$ErrorActionPreference = "Stop"

function Invoke-PireText {
  param([string[]]$Arguments)
  $global:LASTEXITCODE = 0
  $output = & $PirePath @Arguments 2>&1
  $text = ($output | Out-String).Trim()
  if ($global:LASTEXITCODE -ne 0) {
    throw "pire-browser $($Arguments -join ' ') failed with exit code $global:LASTEXITCODE`n$text"
  }
  return $text
}

function Invoke-PireJson {
  param([string[]]$Arguments)
  $text = Invoke-PireText ($Arguments + @("--json"))
  return $text | ConvertFrom-Json
}

function Get-DateKey {
  param($Row)
  try { return [datetime]$Row.request_datetime } catch { return [datetime]::MinValue }
}

function Get-PlaceIdFromFileName {
  param([string]$FileName)
  if ($FileName -match '^place\s+(\d+)\b') { return $matches[1] }
  return ""
}

function Get-RbxlxLinksFromSnapshot {
  param($Snapshot)
  $elements = @()
  foreach ($frame in @($Snapshot.frames)) {
    foreach ($element in @($frame.elements)) {
      if ($element.role -eq "link" -and $element.name -like "*.rbxlx") {
        $elements += $element
      }
    }
  }
  return @($elements)
}

function Wait-ForDownloadPage {
  $deadline = (Get-Date).AddSeconds($PageTimeoutSeconds)
  $lastText = ""
  $lastSummary = ""
  while ((Get-Date) -lt $deadline) {
    $snapshot = Invoke-PireJson @("snapshot")
    $links = @(Get-RbxlxLinksFromSnapshot $snapshot)
    $buttons = @()
    foreach ($frame in @($snapshot.frames)) {
      foreach ($element in @($frame.elements)) {
        if ($element.role -eq "button" -and $element.name -eq "Download") {
          $buttons += $element
        }
      }
    }
    if ($links.Count -ge 1 -and $buttons.Count -ge 1) {
      if ($links.Count -gt 1) {
        throw "Expected one .rbxlx link, found $($links.Count). Refusing to guess."
      }
      return $links[0].name
    }
    $lastText = $snapshot.text
    $lastSummary = "rbxlxLinks=$($links.Count), downloadButtons=$($buttons.Count)"
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for one .rbxlx link and a Download button. Last snapshot: $lastText ($lastSummary)"
}

function Get-DownloadCandidates {
  param([string]$ExpectedFileName, [datetime]$StartedAt)

  $base = [System.IO.Path]::GetFileNameWithoutExtension($ExpectedFileName)
  $extension = [System.IO.Path]::GetExtension($ExpectedFileName)
  $roots = @($DownloadDir, $TargetDir)
  $candidates = @()
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $candidates += @(Get-ChildItem -LiteralPath $root -Filter "*.rbxlx" -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.LastWriteTime -ge $StartedAt.AddSeconds(-2) -and (
          $_.Name -eq $ExpectedFileName -or
          ($_.Name.StartsWith("$base (") -and $_.Name.EndsWith($extension))
        )
      })
  }
  return @($candidates | Sort-Object LastWriteTime -Descending)
}

function Wait-ForStableFile {
  param([string]$ExpectedFileName, [datetime]$StartedAt)

  $deadline = (Get-Date).AddMinutes($DownloadTimeoutMinutes)
  $lastPath = ""
  $lastLength = -1
  $stableSince = $null

  while ((Get-Date) -lt $deadline) {
    foreach ($item in @(Get-DownloadCandidates $ExpectedFileName $StartedAt)) {
      $partFiles = @(
        "$($item.FullName).part",
        "$($item.FullName).crdownload"
      ) | Where-Object { Test-Path -LiteralPath $_ }

      if ($partFiles.Count -eq 0 -and $item.Length -gt 0) {
        if ($item.FullName -eq $lastPath -and $item.Length -eq $lastLength) {
          if ($null -eq $stableSince) { $stableSince = Get-Date }
          if (((Get-Date) - $stableSince).TotalSeconds -ge 3) {
            return $item
          }
        } else {
          $lastPath = $item.FullName
          $lastLength = $item.Length
          $stableSince = $null
        }
      }
    }
    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for download: $ExpectedFileName"
}

function Click-DownloadButton {
  $deadline = (Get-Date).AddSeconds(30)
  $lastError = ""
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-PireText @("find", "role", "button", "--name", "Download", "click") | Write-Host
      return
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 2
    }
  }
  throw "Could not click Download button after retries: $lastError"
}

function Test-SameFileContent {
  param([System.IO.FileInfo]$Left, [System.IO.FileInfo]$Right)
  if ($Left.Length -ne $Right.Length) { return $false }
  $leftHash = (Get-FileHash -LiteralPath $Left.FullName -Algorithm SHA256).Hash
  $rightHash = (Get-FileHash -LiteralPath $Right.FullName -Algorithm SHA256).Hash
  return $leftHash -eq $rightHash
}

function Get-ExistingCandidateFiles {
  param($Rows, $Row, [string]$ExpectedFileName)

  $seen = @{}
  $files = @()
  $paths = @()
  if ($Row.file_location) { $paths += $Row.file_location }
  if ($ExpectedFileName) { $paths += (Join-Path $TargetDir $ExpectedFileName) }

  foreach ($r in @($Rows | Where-Object { $_.game_id -eq $Row.game_id })) {
    if ($r.file_location) { $paths += $r.file_location }
  }

  foreach ($path in $paths) {
    if (-not $path) { continue }
    if ((Test-Path -LiteralPath $path) -and -not $seen.ContainsKey($path)) {
      $seen[$path] = $true
      $files += Get-Item -LiteralPath $path
    }
  }

  $exactIdFiles = @(Get-ChildItem -LiteralPath $TargetDir -Filter "place $($Row.game_id)*.rbxlx" -File -ErrorAction SilentlyContinue)
  foreach ($file in $exactIdFiles) {
    if (-not $seen.ContainsKey($file.FullName)) {
      $seen[$file.FullName] = $true
      $files += $file
    }
  }

  return @($files)
}

function Get-ArchivePath {
  param([System.IO.FileInfo]$File)

  $pastDir = Join-Path $TargetDir "Past Versions"
  if (-not (Test-Path -LiteralPath $pastDir)) {
    New-Item -ItemType Directory -Path $pastDir | Out-Null
  }

  $stamp = $File.CreationTime.ToString("yyyyMMdd-HHmmss")
  $base = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
  $extension = $File.Extension
  $candidate = Join-Path $pastDir "$base $stamp$extension"
  $i = 2
  while (Test-Path -LiteralPath $candidate) {
    $candidate = Join-Path $pastDir "$base $stamp-$i$extension"
    $i++
  }
  return $candidate
}

function Move-ToPastVersions {
  param([System.IO.FileInfo]$File)

  $archivePath = Get-ArchivePath $File
  Move-Item -LiteralPath $File.FullName -Destination $archivePath
  Write-Host "Archived old version: $archivePath"
  return Get-Item -LiteralPath $archivePath
}

function Move-VerifiedFileToTarget {
  param([System.IO.FileInfo]$File, [string]$ExpectedFileName, [System.IO.FileInfo[]]$OldFiles, [bool]$IsDuplicate)

  $destination = Join-Path $TargetDir $ExpectedFileName
  $isVariantDownload = $File.Name -like "$([System.IO.Path]::GetFileNameWithoutExtension($ExpectedFileName)) (*)$([System.IO.Path]::GetExtension($ExpectedFileName))"
  if ($File.Name -ne $ExpectedFileName -and -not $isVariantDownload) {
    throw "Downloaded file name mismatch. Expected '$ExpectedFileName', got '$($File.Name)'"
  }

  if (-not $IsDuplicate) {
    if ($File.FullName -eq $destination) { return Get-Item -LiteralPath $destination }
    if (Test-Path -LiteralPath $destination) {
      $existing = Get-Item -LiteralPath $destination
      if (Test-SameFileContent $existing $File) {
        Remove-Item -LiteralPath $File.FullName -Force
        return $existing
      }
      throw "Destination exists with different content: $destination"
    }
    Move-Item -LiteralPath $File.FullName -Destination $destination
    return Get-Item -LiteralPath $destination
  }

  foreach ($old in @($OldFiles)) {
    if ($old.FullName -eq $File.FullName) { continue }
    if (Test-SameFileContent $old $File) {
      Write-Host "Duplicate game_id produced identical content. Keeping existing file and deleting new download."
      if ($File.FullName -ne $old.FullName) { Remove-Item -LiteralPath $File.FullName -Force }
      return $old
    }
  }

  foreach ($old in @($OldFiles)) {
    if ($old.FullName -eq $File.FullName) { continue }
    if (Test-Path -LiteralPath $old.FullName) {
      Move-ToPastVersions $old | Out-Null
    }
  }

  if (Test-Path -LiteralPath $destination) {
    $existingDestination = Get-Item -LiteralPath $destination
    if ($existingDestination.FullName -ne $File.FullName) {
      Move-ToPastVersions $existingDestination | Out-Null
    }
  }

  if ($File.FullName -ne $destination) {
    Move-Item -LiteralPath $File.FullName -Destination $destination -Force
  }
  return Get-Item -LiteralPath $destination
}

function Save-Rows {
  param($Rows, [string[]]$ColumnNames)
  $lastError = $null
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
      $Rows | Select-Object $ColumnNames | Export-Csv -LiteralPath $CsvPath -NoTypeInformation
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds (250 * $attempt)
    }
  }
  throw "could not update CSV: $($lastError.Exception.Message)"
}

function Update-RowStatus {
  param($Rows, $Row, [System.IO.FileInfo]$VerifiedFile, [string[]]$ColumnNames)

  $Row.status = "downloaded"
  $Row.success_datetime = (Get-Date).ToString("M/d/yyyy H:mm")
  $Row.file_location = $VerifiedFile.FullName
  Save-Rows $Rows $ColumnNames
  Write-Host "Updated CSV: $($Row.link) -> downloaded ($($VerifiedFile.Length) bytes)"
}

function Remove-PriorDuplicateRows {
  param($Rows, $Row, [string[]]$ColumnNames)

  $currentId = [int]$Row.__pire_row_id
  $priorRows = @($Rows | Where-Object {
    $_.game_id -eq $Row.game_id -and [int]$_.__pire_row_id -ne $currentId -and (Get-DateKey $_) -le (Get-DateKey $Row)
  })

  if ($priorRows.Count -eq 0) { return @($Rows) }

  $remaining = @($Rows | Where-Object {
    $candidate = $_
    -not (@($priorRows | Where-Object { [int]$_.__pire_row_id -eq [int]$candidate.__pire_row_id }).Count -gt 0)
  })
  Save-Rows $remaining $ColumnNames
  Write-Host "Deleted $($priorRows.Count) prior duplicate row(s) for game_id $($Row.game_id)"
  return @($remaining)
}

function Get-LatestRowForGameId {
  param($Rows, [string]$GameId)
  return @($Rows | Where-Object { $_.game_id -eq $GameId } | Sort-Object { Get-DateKey $_ }, { [int]$_.__pire_row_id })[-1]
}

if (-not (Test-Path -LiteralPath $CsvPath)) { throw "CSV not found: $CsvPath" }
if (-not (Test-Path -LiteralPath $TargetDir)) { throw "Target directory not found: $TargetDir" }
if (-not (Test-Path -LiteralPath $DownloadDir)) { throw "Download directory not found: $DownloadDir" }
if (-not (Test-Path -LiteralPath $PirePath)) { throw "pire-browser executable not found: $PirePath" }

$status = Invoke-PireText @("status")
if ($status -notmatch "^[1-9][0-9]* live pire-browser session") {
  throw "No live pire-browser session. Start Firefox with the extension before running this script."
}

$backup = "$CsvPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $CsvPath -Destination $backup
Write-Host "CSV backup: $backup"

$rows = @(Import-Csv -LiteralPath $CsvPath)
$columnNames = @($rows[0].PSObject.Properties.Name | Where-Object { $_ -ne "__pire_row_id" })
if ($columnNames -notcontains "file_location") { $columnNames += "file_location" }

for ($i = 0; $i -lt $rows.Count; $i++) {
  if (-not ($rows[$i].PSObject.Properties.Name -contains "file_location")) {
    $rows[$i] | Add-Member -NotePropertyName "file_location" -NotePropertyValue ""
  }
  $rows[$i] | Add-Member -NotePropertyName "__pire_row_id" -NotePropertyValue $i -Force
}

$duplicateLatestIds = @{}
foreach ($group in @($rows | Group-Object game_id | Where-Object Count -gt 1)) {
  $latest = Get-LatestRowForGameId $rows $group.Name
  $duplicateLatestIds[[int]$latest.__pire_row_id] = $true
}

$queue = @($rows | Where-Object {
  if ($_.status -ne "downloaded") { return $true }
  if ($IncludeDownloadedDuplicates -and $duplicateLatestIds.ContainsKey([int]$_.__pire_row_id)) { return $true }
  return $false
} | Sort-Object { Get-DateKey $_ }, { [int]$_.__pire_row_id })

if ($Limit -gt 0) { $queue = @($queue | Select-Object -First $Limit) }

$completed = 0
$failed = 0
$skipped = 0
$failureLog = Join-Path $TargetDir ("download_failures-{0}.csv" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
foreach ($row in $queue) {
  $latestForGameId = Get-LatestRowForGameId $rows $row.game_id
  if ([int]$latestForGameId.__pire_row_id -ne [int]$row.__pire_row_id) {
    Write-Host ""
    Write-Host "=== Skipping superseded duplicate $($row.request_datetime) $($row.truncated_name) ==="
    Write-Host "Latest row for game_id $($row.game_id) is $($latestForGameId.request_datetime) $($latestForGameId.link)"
    $skipped++
    continue
  }

  Write-Host ""
  Write-Host "=== $($row.request_datetime) $($row.truncated_name) ==="
  Write-Host $row.link
  try {
    Invoke-PireText @("open", $row.link) | Write-Host
    $expectedFileName = Wait-ForDownloadPage
    Write-Host "Displayed filename: $expectedFileName"

    $isDuplicate = @($rows | Where-Object { $_.game_id -eq $row.game_id }).Count -gt 1
    $oldFiles = @(Get-ExistingCandidateFiles $rows $row $expectedFileName)
    $targetPath = Join-Path $TargetDir $expectedFileName
    $downloadPath = Join-Path $DownloadDir $expectedFileName

    if (-not $isDuplicate -and (Test-Path -LiteralPath $targetPath)) {
      $verified = Get-Item -LiteralPath $targetPath
      Write-Host "Already present in target: $targetPath"
      Update-RowStatus $rows $row $verified $columnNames
      $completed++
      Start-Sleep -Seconds 3
      continue
    }
    if (-not $isDuplicate -and (Test-Path -LiteralPath $downloadPath)) {
      $verified = Move-VerifiedFileToTarget (Get-Item -LiteralPath $downloadPath) $expectedFileName @() $false
      Write-Host "Moved existing download: $($verified.FullName)"
      Update-RowStatus $rows $row $verified $columnNames
      $completed++
      Start-Sleep -Seconds 3
      continue
    }

    if ($isDuplicate) {
      Write-Host "Duplicate game_id detected; downloading current link for content comparison."
    }

    $startedAt = Get-Date
    Click-DownloadButton
    $downloaded = Wait-ForStableFile $expectedFileName $startedAt
    $verified = Move-VerifiedFileToTarget $downloaded $expectedFileName $oldFiles $isDuplicate
    Write-Host "Verified file: $($verified.FullName)"
    Update-RowStatus $rows $row $verified $columnNames

    if ($isDuplicate) {
      $rows = @(Remove-PriorDuplicateRows $rows $row $columnNames)
    }

    $completed++
    Start-Sleep -Seconds 3
  } catch {
    $failed++
    $message = $_.Exception.Message
    Write-Host "Row failed; leaving CSV status unchanged: $message" -ForegroundColor Yellow
    [pscustomobject]@{
      request_datetime = $row.request_datetime
      game_id = $row.game_id
      truncated_name = $row.truncated_name
      link = $row.link
      error = $message
      failed_at = (Get-Date).ToString("M/d/yyyy H:mm:ss")
    } | Export-Csv -LiteralPath $failureLog -NoTypeInformation -Append
    if ($StopOnError) { throw }
    Start-Sleep -Seconds 3
  }
}

Write-Host ""
Write-Host "Completed $completed row(s); skipped $skipped superseded duplicate row(s); failed $failed row(s)."
if ($failed -gt 0) { Write-Host "Failure log: $failureLog" }
