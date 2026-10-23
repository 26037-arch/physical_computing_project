# 컴과2 피지컬 컴퓨팅 수행평가 — 에이전트 작업 규칙

Claude Code와 Codex가 함께 쓰는 공용 규칙 (CLAUDE.md는 이 파일을 불러온다).

## 도구 체인
| 단계 | 도구 | 사용법 |
|---|---|---|
| 회로/코드 시뮬레이션 | Wokwi (CLI + MCP `wokwi`) | `.\scripts\simulate.ps1 -ExpectText READY`, `-Scenario tests\button.test.yaml` |
| 컴파일·라이브러리·업로드 | Arduino CLI | `.\scripts\build.ps1`, `.\scripts\upload.ps1 -Port COM3` |
| 3D 하우징 설계 | Fusion 360 API (MCP `fusion`) | `fusion_exec` 도구로 Python 실행, 스크립트는 `fusion/scripts/` |

## 폴더 구조
- `firmware/main/main.ino` — 펌웨어 (스케치 폴더명 = 파일명 `main`)
- `diagram.json`, `wokwi.toml` — Wokwi 회로도, `build/main.ino.hex|elf` 를 시뮬레이션
- `fusion/scripts/*.py` — Fusion 설계 스크립트 (단위 cm). `fusion_exec` 실행 시 `adsk, app, ui, design, root` 가 미리 정의됨, 반환값은 `result` 에 대입
- `tools/fusion-bridge/` — Fusion 애드인(HTTP 127.0.0.1:7432) + MCP 서버
- `tests/*.test.yaml` — Wokwi 시나리오 테스트 (버튼 입력 → 시리얼 출력 검증)
- `docs/` — 보고서·설계 기록

## 작업 순서
1. 회로를 `diagram.json` 에 반영 → 코드 작성 → `build.ps1` 로 컴파일 오류 0 확인
2. Wokwi로 동작 검증 (시리얼 출력은 `--expect-text`, 입력 시나리오는 `--scenario`)
3. 실제 부품 크기를 기준으로 Fusion 하우징 설계 → STL 내보내기
4. 실제 보드에 업로드 후 테스트, 결과를 `docs/` 에 기록

## 규칙
- PowerShell 실행 정책 때문에 스크립트는 `powershell -ExecutionPolicy Bypass -File scripts/<이름>.ps1 ...` 로 실행한다 (시스템 정책은 바꾸지 않음)
- 기본 보드 FQBN: `arduino:avr:uno` (다르면 스크립트 `-Fqbn` 인자로 지정)
- 라이브러리 추가 시 `arduino-cli lib install "<이름>"` 후 `docs/SETUP.md` 의 목록 갱신
- 핀 배치를 바꾸면 `diagram.json` 과 코드 상단 상수를 함께 바꾼다
- `WOKWI_CLI_TOKEN` 등 비밀값은 저장소에 커밋하지 않는다
