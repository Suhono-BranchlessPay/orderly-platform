from pathlib import Path
import re

root = Path(r"C:\Users\Thinkbook\Downloads\Orderly Platform")
# rebuild already done separately; just cache-bust + copy
src = root / "assets" / "brand" / "orderly-logo.png"
patch = root / "deploy" / "orderlyfoods-lang-patch"
patch.mkdir(parents=True, exist_ok=True)
(patch / "orderly-logo.png").write_bytes(src.read_bytes())
trans = root / "assets" / "brand" / "orderly-logo-transparent.png"
if trans.exists():
    (patch / "orderly-logo-transparent.png").write_bytes(trans.read_bytes())

js = patch / "assets" / "index-GxDQVBBw.js"
s = js.read_text(encoding="utf-8")
s2 = re.sub(r"/orderly-logo\.png(?:\?v=[^\"]*)?", "/orderly-logo.png?v=20260711d", s)
js.write_text(s2, encoding="utf-8")
print("logo bytes", src.stat().st_size)
print("bust refs", s2.count("orderly-logo.png?v=20260711d"))
