<#
  Wrapper for the hourly GitHub push, invoked by Windows Task Scheduler.
  NOTE: Automatic hourly push has been stopped by user request.
#>

exit 0

param(
  [int]$KeepLogs = 14
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root '.git\push-logs'

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logDir "push-$stamp.log"

function Write-Log($message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  Add-Content -LiteralPath $logFile -Value $line
  Write-Output $line
}

Write-Log 'hourly push starting'

try {
  Push-Location $root

  # Node writes the real outcome; capture it and keep the exit code.
  $output = & node (Join-Path $root 'scripts\auto-push.mjs') 2>&1
  $code = $LASTEXITCODE

  foreach ($line in $output) { Write-Log $line.ToString() }

  if ($code -eq 0) {
    Write-Log 'finished successfully'
  } else {
    Write-Log "finished with exit code $code"
  }
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
}
finally {
  Pop-Location -ErrorAction SilentlyContinue

  # Rotate: keep only the most recent N logs.
  Get-ChildItem -LiteralPath $logDir -Filter 'push-*.log' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -Skip $KeepLogs |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# Always exit 0: the log is the record of what happened.
exit 0
