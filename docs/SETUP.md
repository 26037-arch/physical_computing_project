# 개발 환경 준비 현황

## 설치 완료
- Arduino CLI 1.5.1 (`C:\Program Files\Arduino CLI`), 코어 `arduino:avr 1.8.8`, `arduino:renesas_uno 1.6.0`
- 라이브러리: Servo, LiquidCrystal I2C, DHT sensor library, Adafruit Unified Sensor
- Wokwi CLI 0.29.0 (`%USERPROFILE%\.wokwi\bin`, 사용자 PATH 등록됨)
- Codex CLI 0.163.0 (ChatGPT 로그인 완료)
- Fusion 360 + FusionMCPBridge 애드인 (`%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\FusionMCPBridge`)
- MCP 설정: Claude Code `.mcp.json`, Codex `.codex/config.toml` (wokwi, fusion)
- Claude Code 플러그인 등록: `.claude/settings.json` → `codex@openai-codex`

## 직접 해야 하는 일
1. ~~Wokwi 토큰~~ 완료 (사용자 환경변수 `WOKWI_CLI_TOKEN`)
2. ~~Fusion 애드인 실행~~ 완료 (Fusion 시작 시 자동 실행, 샘플 하우징 생성 확인)
3. **Codex 플러그인**: 이 폴더를 Claude Code에서 열 때 플러그인 설치를 묻는다면 승인 →
   `/codex:setup` 실행. 묻지 않으면 터미널 `claude` 에서
   `/plugin marketplace add openai/codex-plugin-cc` → `/plugin install codex@openai-codex`
4. **Codex에서 이 폴더 신뢰**: Codex로 처음 열 때 trust 승인 (그래야 `.codex/config.toml` 이 적용됨)
5. **실제 보드**: 연결 후 `arduino-cli board list` 로 포트 확인 → `.\scripts\upload.ps1 -Port COMx`
   (CH340 호환보드면 CH340 드라이버 필요할 수 있음)

## 확인 명령 (2026-10-23 모두 통과)
```
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -ExpectText READY
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/button.test.yaml
```
일반 PowerShell은 기본 실행 정책이 .ps1 실행을 막으므로 `-ExecutionPolicy Bypass` 를 붙인다.
