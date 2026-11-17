#!/usr/bin/env python3
"""Zayıfla uygulama ikonlarını üretir (Pillow gerekir):  python3 tools/make-icons.py"""
import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

C1 = (16, 185, 129)   # emerald
C2 = (13, 116, 144)   # deep teal
FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]


def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))
    return img


def font(px):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def draw_mark(img, scale):
    """Kalori halkası + Z harfi; scale = içeriğin kapladığı oran (0-1)."""
    s = img.size[0]
    d = ImageDraw.Draw(img)
    cx = cy = s / 2
    r = s * scale / 2
    w = max(2, int(r * 0.17))
    box = [cx - r + w / 2, cy - r + w / 2, cx + r - w / 2, cy + r - w / 2]
    # soluk arka halka
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse(box, outline=(255, 255, 255, 70), width=w)
    # ilerleme yayı (~%75)
    start, end = -90, 180
    od.arc(box, start, end, fill=(255, 255, 255, 255), width=w)
    rr = r - w + 0.5
    for ang in (start, end):
        a = math.radians(ang)
        px, py = cx + rr * math.cos(a), cy + rr * math.sin(a)
        od.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=(255, 255, 255, 255))
    img.paste(overlay, (0, 0), overlay)
    d = ImageDraw.Draw(img)
    f = font(int(r * 1.15))
    text = 'Z'
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((cx - tw / 2 - bb[0], cy - th / 2 - bb[1]), text, font=f, fill=(255, 255, 255))


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make(size, kind):
    S = size * 4  # süper örnekleme
    bg = gradient(S).convert('RGBA')
    if kind == 'maskable':
        draw_mark(bg, 0.52)  # güvenli bölge (%80 daire) içinde
        out = bg
    elif kind == 'apple':
        draw_mark(bg, 0.62)
        out = bg.convert('RGB')
    else:
        draw_mark(bg, 0.64)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        out.paste(bg, (0, 0), rounded_mask(S, int(S * 0.22)))
    return out.resize((size, size), Image.LANCZOS)


targets = [
    ('icon-192.png', 192, 'any'),
    ('icon-512.png', 512, 'any'),
    ('maskable-192.png', 192, 'maskable'),
    ('maskable-512.png', 512, 'maskable'),
    ('apple-touch-icon.png', 180, 'apple'),
    ('favicon-32.png', 32, 'any'),
]
for name, size, kind in targets:
    make(size, kind).save(os.path.join(OUT, name), optimize=True)
    print('yazıldı:', name)
