# 펌웨어 컴파일 -> build/main.ino.hex, build/main.ino.elf (Wokwi가 사용)
param([string]$Fqbn = "")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $Fqbn) { $Fqbn = (Get-Content "$root\config\robot_v4.json" -Raw | ConvertFrom-Json).simulationBoard }
$cli = (Get-Command arduino-cli -ErrorAction SilentlyContinue).Source
if (-not $cli) { $cli = "C:\Program Files\Arduino CLI\arduino-cli.exe" }
& $cli compile --fqbn $Fqbn --output-dir "$root\build" "$root\firmware\main"
exit $LASTEXITCODE
