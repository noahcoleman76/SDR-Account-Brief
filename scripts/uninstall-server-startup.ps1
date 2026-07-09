$ErrorActionPreference = "Stop"

$taskName = "Account Briefs Local Server"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "Removed scheduled task if it existed: $taskName"
