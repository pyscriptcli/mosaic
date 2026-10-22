$ErrorActionPreference = "Stop"

$taskName = "Mosaic Property Decks Helper"
$stateDirectory = Join-Path $env:LOCALAPPDATA "Mosaic\Helper"
$pidFile = Join-Path $stateDirectory "helper.pid"
$helperScript = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\mosaic-helper.cjs"

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $pidFile) {
  $helperPid = 0
  if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw), [ref]$helperPid)) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $helperPid" -ErrorAction SilentlyContinue
    if ($processInfo -and $processInfo.CommandLine -like "*$helperScript*") {
      Stop-Process -Id $helperPid -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Mosaic Helper will no longer start in the background."
