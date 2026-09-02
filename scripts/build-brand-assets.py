"""
@module scripts/build-brand-assets
@description Genera in modo riproducibile le icone Windows e gli asset PNG dal marchio NEXUSNXS.
"""

from pathlib import Path
from PIL import Image, ImageDraw


#region 01 — Percorsi e palette

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "build" / "branding" / "nexus-mark.png"
OUTPUT_PNG = ROOT / "build" / "icon.png"
OUTPUT_ICO = ROOT / "build" / "icon.ico"
OUTPUT_UI = ROOT / "src" / "renderer" / "assets" / "nexus-mark-ui.png"
ANDROID_REMOTE_DRAWABLE = ROOT / "android" / "NexusRemote" / "app" / "src" / "main" / "res" / "drawable-nodpi"
ANDROID_CONSOLE_DRAWABLE = ROOT / "android" / "NexusConsole" / "app" / "src" / "main" / "res" / "drawable-nodpi"
OUTPUT_ANDROID_REMOTE = ANDROID_REMOTE_DRAWABLE / "ic_nexus_remote.png"
OUTPUT_ANDROID_CONSOLE = ANDROID_CONSOLE_DRAWABLE / "ic_nexus_console.png"

CANVAS = 1024
BACKGROUND = (4, 10, 12, 255)

#endregion


#region 02 — Composizione del simbolo

def compose_icon() -> Image.Image:
    """Crea una tessera antracite con il marchio centrato e margine ottico."""
    mark = Image.open(SOURCE).convert("RGBA")
    bounds = mark.getbbox()
    if not bounds:
        raise RuntimeError("Il marchio sorgente non contiene pixel visibili.")
    mark = mark.crop(bounds)
    mark.thumbnail((710, 710), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((32, 32, 992, 992), radius=224, fill=255)
    tile = Image.new("RGBA", (CANVAS, CANVAS), BACKGROUND)
    canvas.alpha_composite(Image.composite(tile, Image.new("RGBA", tile.size), mask))
    canvas.alpha_composite(mark, ((CANVAS - mark.width) // 2, (CANVAS - mark.height) // 2))
    return canvas


def compose_ui_mark() -> Image.Image:
    """Deriva una variante leggera e trasparente per la firma nel renderer."""
    mark = Image.open(SOURCE).convert("RGBA")
    bounds = mark.getbbox()
    if not bounds:
        raise RuntimeError("Il marchio sorgente non contiene pixel visibili.")
    mark = mark.crop(bounds)
    mark.thumbnail((224, 224), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((256 - mark.width) // 2, (256 - mark.height) // 2))
    return canvas


def compose_android_variant(kind: str) -> Image.Image:
    """Mantiene il marchio desktop, senza badge, nella variante Android."""
    if kind == "console":
        return compose_power_console_icon()
    return compose_icon().resize((512, 512), Image.Resampling.LANCZOS)


def compose_power_console_icon() -> Image.Image:
    """Crea il pulsante power pulito usato dalla Console privata."""
    scale = 2
    work = Image.new("RGBA", (512 * scale, 512 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(work, "RGBA")

    # Tessera antracite neutra: la maschera finale viene scelta dal launcher Android.
    draw.rounded_rectangle((32, 32, 992, 992), radius=224, fill=(36, 38, 39, 255))

    cyan = (8, 199, 229, 255)
    stroke = 78
    ring_box = (224, 224, 800, 800)
    start, end = 315, 225

    draw.arc(ring_box, start, end, fill=cyan, width=stroke)

    # Il centro della traccia di arc() è interno al box di metà spessore.
    import math
    radius = ((ring_box[2] - ring_box[0]) - stroke) / 2
    center = ((ring_box[0] + ring_box[2]) / 2, (ring_box[1] + ring_box[3]) / 2)
    for angle in (start, end):
        radians = math.radians(angle)
        x = center[0] + radius * math.cos(radians)
        y = center[1] + radius * math.sin(radians)
        draw.ellipse((x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2), fill=cyan)

    draw.rounded_rectangle((473, 150, 551, 510), radius=39, fill=cyan)
    return work.resize((512, 512), Image.Resampling.LANCZOS)


def main() -> None:
    icon = compose_icon()
    icon.save(OUTPUT_PNG, optimize=True)
    icon.save(OUTPUT_ICO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    OUTPUT_UI.parent.mkdir(parents=True, exist_ok=True)
    compose_ui_mark().save(OUTPUT_UI, optimize=True)
    ANDROID_REMOTE_DRAWABLE.mkdir(parents=True, exist_ok=True)
    ANDROID_CONSOLE_DRAWABLE.mkdir(parents=True, exist_ok=True)
    compose_android_variant("remote").save(OUTPUT_ANDROID_REMOTE, optimize=True)
    compose_android_variant("console").save(OUTPUT_ANDROID_CONSOLE, optimize=True)
    print(f"Brand NEXUSNXS generato: {OUTPUT_PNG.name}, {OUTPUT_ICO.name}, {OUTPUT_UI.name}, {OUTPUT_ANDROID_REMOTE.name}, {OUTPUT_ANDROID_CONSOLE.name}")


if __name__ == "__main__":
    main()

# NEXUSNXS-EGG: molti filamenti, un solo punto d'incontro.

#endregion
