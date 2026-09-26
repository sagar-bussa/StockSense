<#
  Registers (or updates) the hourly GitHub push as a Windows scheduled task.

  Run it once, from an elevated or normal PowerShell prompt:
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-hourly-push.ps1

  The task runs as the current user at logon, so it needs no stored password
  and no service account. Use -Remove to uninstall it.
#>

param(
  [string]$TaskName = 'StockSense Hourly Push',
  [string]$AtLogon = '04:00',
  [switch]$Remove
)

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\hourly-push.ps1'

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "removed task '$TaskName'"
  } else {
    Write-Output "no task named '$TaskName'"
  }
  return
}

if (-not (Test-Path -LiteralPath $script)) {
  throw "wrapper not found at $script"
}

# A git remote is required for the push to go anywhere. Warn but still
# install: the script commits locally and reports the missing remote.
$remote = (& git -C $root remote 2>$null)
if (-not $remote) {
  Write-Warning @'
No git remote configured. The task will still commit locally each hour, but
nothing will be pushed. Add one with:
    git remote add origin <your-repo-url>
'@
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

# Fires once an hour, starting five minutes from now so the first run proves
# itself shortly after installation.
#
# The trigger is built with -Once/-RepetitionInterval rather than by mutating
# the object afterwards: an AtLogOn trigger has no StartBoundary, so poking
# Repetition onto it yields a task that is registered successfully but never
# fires. Duration P1D repeats for a day; combined with -AtLogOn below the task
# still runs the first time a user signs in after that window.
$startAt = (Get-Date).AddMinutes(5)
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At $startAt `
  -RepetitionInterval (New-TimeSpan -Hours 1)

# Repeat indefinitely rather than stopping after the first day.
$trigger.Repetition.Duration = 'P1D'
$trigger.Repetition.StopAtDurationEnd = $false

# Also run on sign-in, so a machine that was asleep at the top of the hour
# still gets its push that day.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$logonTrigger.Delay = 'PT10M'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

# A push needs credentials. A plain git remote over HTTPS would prompt, which
# cannot happen in a hidden task, so the task only works once a credential
# helper or SSH key is configured. The user is told this below.
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

try {
  # -ErrorAction Stop matters: without it Register-ScheduledTask writes a
  # non-terminating error, the catch below never runs, and the script would
  # report success for a task that was never created.
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($trigger, $logonTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Description 'Commits changed files and pushes to GitHub once an hour. Skips runs with nothing to commit.' `
    -ErrorAction Stop | Out-Null
}
catch {
  # Registering a scheduled task normally needs an elevated prompt. Say so
  # plainly rather than continuing as if it worked.
  Write-Error @"
Failed to register '$TaskName': $($_.Exception.Message)

Registering a scheduled task usually requires an elevated PowerShell. Re-run
this script from an Administrator prompt:

    Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath"'
"@
  exit 1
}

# Only claim success once the task is genuinely queryable.
$installed = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $installed) {
  Write-Error "registration reported no error, but '$TaskName' does not exist."
  exit 1
}

# A task can register cleanly and still never fire, if its trigger ended up with
# no start time. Check that a next run is actually scheduled before reporting
# success, otherwise this silently becomes a no-op that looks installed.
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$hasStart = @($installed.Triggers | Where-Object { $_.StartBoundary }).Count -gt 0
if (-not $hasStart -and $info.NextRunTime -eq [datetime]::MinValue) {
  Write-Error "'$TaskName' is registered but has no scheduled start time and will never run."
  exit 1
}

Write-Output "installed task '$TaskName'"
Write-Output "  script : $script"
Write-Output "  logs   : $(Join-Path $root '.git\push-logs')"
Write-Output "  next   : $($info.NextRunTime)"
Write-Output ''
Write-Output '  check it:  Get-ScheduledTask -TaskName "'$TaskName'" | Get-ScheduledTaskInfo'
Write-Output '  run now:  Start-ScheduledTask -TaskName "'$TaskName'"'
Write-Output '  remove :  powershell -File scripts\install-hourly-push.ps1 -Remove'
