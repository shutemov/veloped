# -*- coding: utf-8 -*-
"""Генерация базовых PNG (fallback). Нужен Roboto-Regular.ttf (кириллица). Запуск: python generate_markers.py"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONT_PATH = HERE / "Roboto-Regular.ttf"
SIZE = 288


def load_font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if FONT_PATH.is_file():
        return ImageFont.truetype(str(FONT_PATH), px)
    raise FileNotFoundError(f"Нет шрифта с кириллицей: {FONT_PATH}")


def make_marker(path: Path, fill_rgb: tuple[int, int, int], label: str) -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(8, SIZE // 32)
    cx = cy = SIZE // 2
    r = min(cx, cy) - pad
    fill = fill_rgb + (255,)
    white = (255, 255, 255, 255)
    outline_w = max(3, SIZE // 48)
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=fill,
        outline=white,
        width=outline_w,
    )
    font_size = max(22, min(48, r // 2))
    font = load_font(font_size)
    draw.text((cx, cy), label, fill=white, font=font, anchor="mm")
    img.save(path, "PNG")
    print("OK", path.name, label)


def main() -> None:
    make_marker(HERE / "pin-start.png", (30, 136, 229), "Старт")
    make_marker(HERE / "pin-end.png", (239, 83, 80), "Финиш")
    make_marker(HERE / "pin-single.png", (0, 172, 193), "Точка")


if __name__ == "__main__":
    main()
