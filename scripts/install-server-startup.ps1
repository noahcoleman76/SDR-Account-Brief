$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$taskName = "Account Briefs Local Server"
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$logPath = Join-Path $projectRoot "server-startup.log"

$action = New-ScheduledTaskAction `
  -Execute $npmPath `
  -Argument "run server" `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Starts the Account Briefs for Outreach local server on login."

Start-ScheduledTask -TaskName $taskName

Write-Host "Installed and started scheduled task: $taskName"
Write-Host "Server URL: http://localhost:8787"
Write-Host "If needed, check Task Scheduler for task status."
