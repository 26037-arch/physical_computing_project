"""제품 이미지(3D 렌더) 캡처 → v5/poster/img/product.png.
기본(--source v5h): 실제 제작물인 V5H(3 mm 포맥스) 3D 조립 설명서 docs/V5H_조립설명서.html 의 완성 화면(#step=108&paused,
107단계 다음 "기구 조립 끝")을 file:// 로 열어 3D 캔버스만 찍는다 (v5/assembly_web/scripts/shots.py 와 같은 방식, 서버 불필요).
--source v5: V5(출력판) v5/sim/wiring.html(로봇 + UNO + 브레드보드 + 점퍼선) — 아래 서버가 필요하다. 실물 사진이 생기면 이 스크립트 대신 같은 이름으로 사진을 덮어쓰고
`npm run build` 만 다시 하면 된다.

사용: python v5/poster/scripts/capture_product.py                      (V5H, 기본)
      node tools/serve.js 8765 & python v5/poster/scripts/capture_product.py --source v5 [--cam az,el,dist,tx,ty,tz]
three.js(r128)는 wiring.html 이 CDN 에서 받는다 — 네트워크가 없으면 THREE_JS=<three.min.js 경로> 로 로컬 파일을 대신 준다.
"""
import argparse, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--source", choices=["v5h", "v5"], default="v5h")
ap.add_argument("--port", default="8765")
ap.add_argument("--zoom", type=int, default=4)   # V5H: 휠 확대 횟수
ap.add_argument("--cam", default="-64,20,470,105,15,0")   # az,el,dist,tx,ty,tz (빈 값이면 wiring.js 의 all 시점)
ap.add_argument("--size", default="1760x1000")
ap.add_argument("--scale", type=float, default=2.0)
ap.add_argument("--chrome", default=os.environ.get("CHROME", "/usr/bin/google-chrome"))
a = ap.parse_args()
out = Path(__file__).resolve().parents[1] / "img" / "product.png"
w, h = map(int, a.size.split("x"))
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=a.chrome, headless=True,
                           args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    if a.source == "v5h":
        html = Path(__file__).resolve().parents[3] / "docs" / "V5H_조립설명서.html"
        ctx = b.new_context(viewport={"width": 2100, "height": 1250}, device_scale_factor=a.scale, color_scheme="light")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(html.as_uri() + "#step=108&paused")
        page.reload()
        page.wait_for_timeout(1500)
        cv = page.locator("canvas").first
        box = cv.bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.55)
        for _ in range(a.zoom):
            page.mouse.wheel(0, -120)
            page.wait_for_timeout(120)
        page.wait_for_timeout(1200)
        cv.screenshot(path=str(out))
    else:
        url = f"http://localhost:{a.port}/v5/sim/wiring.html" + (f"?cam={a.cam}" if a.cam else "")
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=a.scale, color_scheme="light")
        page = ctx.new_page()
        local_three = os.environ.get("THREE_JS")
        if local_three:
            page.route("**/three.min.js", lambda r: r.fulfill(path=local_three, content_type="text/javascript"))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("window.WiringView !== undefined", timeout=60000)
        # 캡처용: 머리말·옆 패널·조작 버튼·이름표를 숨기고 화면 전체를 3D 장면으로
        page.add_style_tag(content="header,aside,.tools,.stage-top,#hoverInfo,#labels{display:none!important}"
                                   "main{grid-template-columns:1fr!important;height:100vh!important}")
        page.wait_for_timeout(500)
        page.evaluate("WiringView.tick(200)")
        page.wait_for_timeout(1500)
        page.locator("#view").screenshot(path=str(out))
    b.close()
if errors:
    print("page errors:", *errors, sep="\n  ", file=sys.stderr); sys.exit(1)
print("saved", out)
