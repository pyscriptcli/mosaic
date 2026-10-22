$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$helperScript = Join-Path $PSScriptRoot "mosaic-helper.cjs"
$node = Get-Command node.exe -ErrorAction Stop
$stateDirectory = Join-Path $env:LOCALAPPDATA "Mosaic\Helper"
$pidFile = Join-Path $stateDirectory "helper.pid"

[System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null

while ($true) {
  try {
    $health = Invoke-RestMethod `
      -Uri "http://127.0.0.1:43127/health" `
      -Headers @{ Origin = "https://mosaic-workspace.online" } `
      -TimeoutSec 2
    if ($health.ok) {
      Start-Sleep -Seconds 15
      continue
    }
  } catch {
    # Start the helper when it is not already serving requests.
  }

  $process = $null
  try {
    $launchId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $stdoutLog = Join-Path $stateDirectory "helper-$launchId.stdout.log"
    $stderrLog = Join-Path $stateDirectory "helper-$launchId.stderr.log"
    $process = Start-Process `
      -FilePath $node.Source `
      -ArgumentList ('"{0}"' -f $helperScript) `
      -WorkingDirectory $frontendRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -PassThru
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
    $process.WaitForExit()
  } catch {
    Add-Content -LiteralPath $stderrLog -Value "$(Get-Date -Format o) $($_.Exception.Message)"
  } finally {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 5
}
