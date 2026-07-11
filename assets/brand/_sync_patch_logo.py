from pathlib import Path
import re
import shutil
import subprocess

root = Path(r"C:\Users\Thinkbook\Downloads\Orderly Platform")
subprocess.check_call(["python", str(root / "assets/brand/build_logo.py")])

brand = root / "assets/brand"
patch = root / "deploy/orderlyfoods-lang-patch"
pub = root / "artifacts/samurai-resto/public"

for name in ["orderly-logo.png", "orderly-logo-transparent.png"]:
    shutil.copy2(brand / name, patch / name)
for name in ["orderly-logo.png", "orderly-powered.png", "orderly-powered-on-dark.png"]:
    shutil.copy2(brand / name, pub / name)

js = patch / "assets/index-GxDQVBBw.js"
s = js.read_text(encoding="utf-8")
s = re.sub(r"/orderly-logo\.png(\?v=[^\"]*)?", "/orderly-logo.png?v=20260711g", s)
js.write_text(s, encoding="utf-8")
print("cache-bust refs", s.count("orderly-logo.png?v=20260711g"))
print("done")
