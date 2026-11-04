"""Builds assets/cursor/cursor-sheet.png from the artist's cursor (assets/cursor/cursor.png).

The arrow comes from capri-desktop's assets/cursor.png: her pink pointer, the one she wears in
the original app. Here it becomes her terminal's pointer, and it glitches the way her HUD does:
most frames are still, then a few slices slip sideways with a cyan/red ghost, then it settles.

The sheet is one row of frames, left to right, each FRAME wide. terminal.css steps through it;
terminal.js slides it under the mouse. Keep COUNT and the frame order here in sync with the
`capri-cursor` animation in src/terminal/terminal.css.

    python tools/build-cursor.py [--preview out.png]

Needs Pillow.
"""
import random
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'cursor' / 'cursor.png'
OUT = ROOT / 'assets' / 'cursor' / 'cursor-sheet.png'
FRAME = 64      # drawn at 64, shown at 32 CSS px: crisp on HiDPI, small on the console
COUNT = 12      # frames in the sheet
GLITCH = (5, 6, 7)  # the frames that tear; the rest are still, so it twitches now and then
PUSH = 7        # furthest a slice slides, in pixels of the 64 frame
CYAN = (58, 214, 235)
RED = (232, 36, 64)


def base():
    """The arrow alone on a square frame, tip at the same place the old pointer's was."""
    src = Image.open(SRC).convert('RGBA')
    art = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
    # same fit as Look.ArtistPointer in capri-desktop: 30/32 of the frame, inset 2/32
    fit = FRAME * 30 / 32 / max(src.width, src.height)
    inset = FRAME * 2 / 32
    small = src.resize((round(src.width * fit), round(src.height * fit)), Image.LANCZOS)
    art.alpha_composite(small, (round(inset), round(inset)))
    return art


def ghost(art, colour, dx):
    """One flat-colour copy of the arrow, slid sideways: the cyan/red doubles in the tear."""
    tint = Image.new('RGBA', art.size, colour + (255,))
    tint.putalpha(art.getchannel('A'))
    out = Image.new('RGBA', art.size, (0, 0, 0, 0))
    out.alpha_composite(tint, (dx, 0))
    return out


def tear(art, rng):
    """Slices knocked sideways: a band crops where it would fall off the frame, so no wrapping."""
    out = art.copy()
    for _ in range(rng.randrange(2, 4)):
        y = rng.randrange(0, FRAME - 1)
        height = min(FRAME - y, rng.randrange(2, 9))
        dx = rng.choice((-1, 1)) * rng.randrange(2, PUSH + 1)
        band = out.crop((0, y, FRAME, y + height))
        out.paste((0, 0, 0, 0), (0, y, FRAME, y + height))
        if dx > 0:
            out.alpha_composite(band.crop((0, 0, FRAME - dx, height)), (dx, y))
        else:
            out.alpha_composite(band.crop((-dx, 0, FRAME, height)), (0, y))
    return out


def main():
    still = base()
    rng = random.Random(7)
    sheet = Image.new('RGBA', (FRAME * COUNT, FRAME), (0, 0, 0, 0))
    for frame in range(COUNT):
        if frame in GLITCH:
            art = Image.new('RGBA', still.size, (0, 0, 0, 0))
            art.alpha_composite(ghost(still, CYAN, -2))
            art.alpha_composite(ghost(still, RED, 2))
            art.alpha_composite(tear(still, rng))
        else:
            art = still
        sheet.alpha_composite(art, (frame * FRAME, 0))
    sheet.save(OUT, optimize=True)
    print(f'wrote {OUT} {sheet.size} ({COUNT} frames)')

    if '--preview' in sys.argv:
        preview = Image.new('RGBA', (FRAME * COUNT, FRAME), (12, 10, 20, 255))
        preview.alpha_composite(sheet)
        preview.save('cursor-preview.png')
        print('wrote cursor-preview.png (on the terminal black)')


if __name__ == '__main__':
    main()
