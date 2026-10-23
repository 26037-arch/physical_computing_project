# 펌웨어 컴파일 -> build/main.ino.hex, build/main.ino.elf (Wokwi가 사용)
param([string]$Fqbn = "arduino:avr:uno")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$cli = (Get-Command arduino-cli -ErrorAction SilentlyContinue).Source
if (-not $cli) { $cli = "C:\Program Files\Arduino CLI\arduino-cli.exe" }
& $cli compile --fqbn $Fqbn --output-dir "$root\build" "$root\firmware\main"
exit $LASTEXITCODE
