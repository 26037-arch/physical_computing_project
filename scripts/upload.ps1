# 실제 보드 업로드. 포트 확인: arduino-cli board list   예: .\scripts\upload.ps1 -Port COM3
param([Parameter(Mandatory = $true)][string]$Port, [string]$Fqbn = "")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $Fqbn) { $Fqbn = (Get-Content "$root\config\robot_v4.json" -Raw | ConvertFrom-Json).physicalBoard }
$cli = (Get-Command arduino-cli -ErrorAction SilentlyContinue).Source
if (-not $cli) { $cli = "C:\Program Files\Arduino CLI\arduino-cli.exe" }
& $cli compile --fqbn $Fqbn --output-dir "$root\build\physical" "$root\firmware\main"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $cli upload -p $Port --fqbn $Fqbn --input-dir "$root\build\physical" "$root\firmware\main"
exit $LASTEXITCODE
