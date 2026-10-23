# FusionMCPBridge 애드인을 Fusion AddIns 폴더에 복사 (코드 수정 후 다시 실행)
$src = Join-Path (Split-Path $PSScriptRoot -Parent) "tools\fusion-bridge\FusionMCPBridge"
$dst = "$env:APPDATA\Autodesk\Autodesk Fusion 360\API\AddIns\FusionMCPBridge"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$src\*" $dst -Force
Write-Output "Installed to $dst  (Fusion: Utilities > Add-Ins > FusionMCPBridge > Run)"
