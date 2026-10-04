"""从 PWA 图标生成 Windows 用的多尺寸 .ico。

为什么需要它：Windows 快捷方式的 `IconLocation` **只接受 .ico**（或 exe/dll 里的图标资源），
给 `.png` 会静默退回系统默认的空白图标 —— 实测 `System.Drawing.Icon('...png')` 直接抛
「Argument 'picture' must be a picture that can be used as a Icon.」。仓库里原本
**一个 .ico 都没有**，所以快捷方式必然是白图标。

尺寸集合按 Windows 各处的实际取用挑：16（列表 / 任务栏小图标）、20、24、32（桌面 /
资源管理器）、40、48（中等图标）、64、96、128、256（大图标 / 超大图标）。
256 用 PNG 压缩存进 ico（Vista 之后的规范），小尺寸用 BMP，这样各处都不糊。

用法：python scripts/make-icon.py
输入 public/icons/icon-512.png，输出 public/icons/life-manager.ico。
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "icons" / "icon-512.png"
TARGET = ROOT / "public" / "icons" / "life-manager.ico"

# Windows 会按显示尺寸挑最接近的一档；给全了才不会缩放出锯齿
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"找不到源图：{SOURCE}")

    source = Image.open(SOURCE).convert("RGBA")
    if source.width != source.height:
        raise SystemExit(f"源图必须是正方形，实际是 {source.size}")

    # 用 LANCZOS 缩小：图标里的「L」是直角笔画，最近邻会留锯齿
    frames = [source.resize((size, size), Image.LANCZOS) for size in SIZES]

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    # sizes= 让它把每一档都写进同一个 ico（多尺寸 ico，Windows 自己挑）
    frames[-1].save(TARGET, format="ICO", sizes=[(s, s) for s in SIZES])

    print(f"已写出 {TARGET.relative_to(ROOT)}")
    print(f"  源图   : {SOURCE.name}  {source.size[0]}x{source.size[1]}")
    print(f"  尺寸   : {', '.join(str(s) for s in SIZES)}")
    print(f"  字节   : {TARGET.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
