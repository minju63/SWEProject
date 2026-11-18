$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Set-Location -LiteralPath $root
$dir=Join-Path $root 'research/housing-sync/daily-logs'
[void][IO.Directory]::CreateDirectory($dir)
$file=Join-Path $dir ((Get-Date -Format 'yyyy-MM-dd_HHmmss')+'.log')
$ErrorActionPreference='Continue'
& 'C:/Program Files/nodejs/node.exe' (Join-Path $root 'backend/scripts/housing-sync/cli.cjs') daily *> $file
$result=$LASTEXITCODE
$ErrorActionPreference='Stop'
@{finished_at=(Get-Date -Format o);exit_code=$result;log_file=$file}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $dir 'latest.json')
exit $result
