$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$runnerScript = Join-Path $PSScriptRoot "Run-Mosaic-Helper.ps1"
$taskName = "Mosaic Property Decks Helper"
$currentUser = "$env:USERDOMAIN\$env:USERNAME"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runnerScript

$node = Get-Command node.exe -ErrorAction Stop
Push-Location $frontendRoot
try {
  & $node.Source -e "require.resolve('typescript'); require.resolve('jszip')"
  if ($LASTEXITCODE -ne 0) {
    throw "Mosaic Helper dependencies are missing. Run npm install from the frontend folder first."
  }
} finally {
  Pop-Location
}

$action = New-ScheduledTaskAction -Execute $powershell -Argument $taskArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Runs the local Mosaic Property Decks helper in the background." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

$connected = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod `
      -Uri "http://127.0.0.1:43127/health" `
      -Headers @{ Origin = "https://mosaic-workspace.online" } `
      -TimeoutSec 2
    if ($health.ok) {
      $connected = $true
      break
    }
  } catch {
    # Keep waiting while Task Scheduler starts the background process.
  }
}

if (-not $connected) {
  throw "The startup task was installed, but Mosaic Helper did not start. Check the logs under $env:LOCALAPPDATA\Mosaic\Helper."
}

Write-Host "Mosaic Helper is running in the background and will start when you sign in."
