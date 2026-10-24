# Wokwi 시뮬레이션 (WOKWI_CLI_TOKEN 필요). 예: .\scripts\simulate.ps1 -ExpectText READY
param([string]$ExpectText = "", [int]$TimeoutMs = 10000, [string]$Scenario = "")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $env:WOKWI_CLI_TOKEN) { $env:WOKWI_CLI_TOKEN = [Environment]::GetEnvironmentVariable("WOKWI_CLI_TOKEN", "User") }
if (-not $env:WOKWI_CLI_TOKEN) { Write-Error "WOKWI_CLI_TOKEN이 없습니다. docs\SETUP.md 참고" }
& "$PSScriptRoot\build.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$wokwiArgs = @("--timeout", $TimeoutMs)
if ($ExpectText) { $wokwiArgs += @("--expect-text", $ExpectText) }
if ($Scenario) { $wokwiArgs += @("--scenario", $Scenario) }
& "$HOME\.wokwi\bin\wokwi-cli.exe" @wokwiArgs $root
exit $LASTEXITCODE
