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
node tools/gen_tables.js
node tools/test_solver.js 300 1
node tools/host_check.js 1 300        # g++ 필요 (MinGW-w64/MSYS2 등). 펌웨어 풀이기 PC 빌드 → JS 와 출력 비교
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/buttons.test.yaml -TimeoutMs 180000
```
일반 PowerShell은 기본 실행 정책이 .ps1 실행을 막으므로 `-ExecutionPolicy Bypass` 를 붙인다.
UNO R4 WiFi 용 컴파일: `arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --output-dir build/r4 firmware/main`
시뮬레이터 미리보기: `node tools/serve.js` → http://localhost:8765/sim/ (Node 외 의존성 없음, Three.js 는 CDN)

## Fusion 브리지 사용 메모
- Fusion 은 시작 메뉴 `Autodesk Fusion` 으로 띄우면 애드인이 자동 실행된다 (`fusion_ping` 으로 확인).
- 긴 작업(STL High 품질 내보내기 등)은 메인 스레드 대기 120 s 를 넘길 수 있다. 부품 단위로 나눠 실행하고 STL 은 Medium 품질을 쓴다.
- 새 문서: `app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)` 후 `DirectDesignType` 으로 두면 타임라인 없이 빠르다. 클라우드 저장(`saveAs`) 대신 `createFusionArchiveExportOptions` 로 `.f3d` 를 저장소에 남긴다.
