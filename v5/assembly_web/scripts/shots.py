"""빌드된 docs/V5H_조립설명서.html 을 file:// 로 열어 스크린샷을 찍고 콘솔 에러·외부 요청을 검사한다.
시스템 Chrome 헤드리스(Playwright python) 사용. 문제가 있으면 종료코드 1."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[3]
html = root / "docs" / "V5H_조립설명서.html"
out = root / "docs" / "images" / "v5h_manual"
out.mkdir(parents=True, exist_ok=True)
url = html.as_uri()

# (파일명, 해시)  — 첫 화면, 1단계, 중간 단계들, 마지막 단계, 완성 화면
shots = [
    ("00_intro", "#step=0"),
    ("01_step1", "#step=1"),
    ("02_step12", "#step=12"),
    ("03_step46", "#step=46"),
    ("04_step77", "#step=77"),
    ("04b_step42", "#step=42"),
    ("04c_step66", "#step=66"),
    ("05_step103", "#step=103"),
    ("06_end", "#step=104"),
]
errors, external = [], []

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        headless=True,
        args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
    )
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url}"))
    page.on("request", lambda r: external.append(r.url) if not r.url.startswith(("file://", "data:", "blob:")) else None)
    for name, h in shots:
        # '&paused' = 정지 상태로 열기 → 도착 상태(마지막 프레임)에서 조각이 제자리에 있어야 한다
        page.goto(url + h + "&paused")
        page.reload()  # 해시 복원(새로고침해도 유지) 동시 확인
        page.wait_for_timeout(1200)
        page.screenshot(path=str(out / f"{name}.png"))
        print("shot", name)
    # 날아오는 중간 장면 (재생 상태, 0.6 s 시점)
    page.goto(url + "#step=42")
    page.reload()
    page.wait_for_timeout(600)
    page.screenshot(path=str(out / "09_midflight_step42.png"))
    # 태블릿 크기
    page.set_viewport_size({"width": 1024, "height": 768})
    page.goto(url + "#step=63&paused")
    page.reload()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(out / "07_tablet_1024x768_step63.png"))
    # 드래그 회전 + 휠 확대 + 키보드
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(url + "#step=20")
    page.reload()
    page.wait_for_timeout(1500)
    page.mouse.move(400, 350)
    page.mouse.down()
    page.mouse.move(520, 300, steps=6)
    page.mouse.up()
    page.mouse.wheel(0, -300)
    page.wait_for_timeout(600)
    page.screenshot(path=str(out / "08_drag_zoom_step20.png"))
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(300)
    h = page.evaluate("location.hash")
    if h != "#step=21":
        errors.append(f"키보드 → 후 해시가 #step=21 이어야 하는데 {h}")
    print("hash after ArrowRight:", h)
    browser.close()

print(f"콘솔 오류/경고 {len(errors)}건, 외부 요청 {len(external)}건")
for e in errors: print("  ", e)
for u in external: print("  external:", u)
sys.exit(1 if errors or external else 0)
