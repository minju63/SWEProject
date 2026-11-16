$ErrorActionPreference='Stop'
$name='SWEProject-Housing-Daily'
$script=Join-Path $PSScriptRoot 'run-daily.ps1'
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if($existing -and $existing.Actions.Arguments -notlike '*housing-sync*run-daily.ps1*'){throw 'Task name belongs to another action'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$script+'"')
$trigger=New-ScheduledTaskTrigger -Daily -At '09:00'
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$task=Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Daily housing API collection and insert-only import. Existing policies remain unchanged. New eligibility is unverified.' -Force
$info=Get-ScheduledTaskInfo -TaskName $name
@{task_name=$task.TaskName;state=[string]$task.State;next_run=$info.NextRunTime.ToString('o');local_timezone=(Get-TimeZone).Id;logon_type='Interactive';action=$task.Actions.Arguments}|ConvertTo-Json
