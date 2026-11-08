#!/usr/bin/env python3
"""Render the cals brand mark (app-icon.svg) to PNG icons for the Unraid
template Icon URL field.

Reproduces app-icon/svg faithfully with Pillow, rendered at 2x then downscaled
with LANCZOS for crisp antialiased edges. Outputs:
  web/frontend/public/pwa/cals-icon-1024.png (source)
  web/frontend/public/pwa/cals-icon-512.png  (link this in the template Icon URL)
"""

import math
from PIL import Image, ImageDraw

SCALE = 2
SIZE = 512 * SCALE
C = lambda v: v * SCALE  # scale coordinate

BG = (74, 144, 217)        # #4a90d9
WHITE = (255, 255, 255)
GREEN = (38, 222, 129)     # #26de81
DARK = (45, 52, 54)        # #2d3436

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 1. Rounded-square background, rx=112
d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=C(112), fill=BG)

# 2. Faint white ring: r=168, stroke width 28, opacity 0.22 -> alpha ~56
ring_r = C(168 - 14)  # centre the 28-wide stroke on the r=168 path
d.ellipse(
    [C(256) - ring_r, C(256) - ring_r, C(256) + ring_r, C(256) + ring_r],
    outline=(255, 255, 255, 56),
    width=C(28),
)

# 3. Green arc: path M256 88 a168 168 0 0 1 163 128, stroke #26de81 width 34,
#    round cap. Clockwise from top (-90 deg, screen coords) to -13.7 deg.
arc_r = C(168 - 17)  # centre the 34-wide stroke on the r=168 path
# Endpoint (419, 216) relative to centre (256, 256): (163, -40). Sweep from top
# (12 o'clock), clockwise on screen, to that point:
sweep = math.degrees(math.atan2(163, 40))  # ~76.2 deg
steps = 60
pts = []
for i in range(steps + 1):
    a = math.radians(-90 + sweep * i / steps)  # screen coords: y down
    pts.append((C(256) + arc_r * math.cos(a), C(256) + arc_r * math.sin(a)))
d.line(pts, fill=GREEN, width=C(34), joint="curve")

# 4. White circle r=113
d.ellipse(
    [C(256) - C(113), C(256) - C(113), C(256) + C(113), C(256) + C(113)],
    fill=WHITE,
)

# 5. Dark face path (from app-icon.svg), approximated by sampling cubic beziers
def cubic(p0, p1, p2, p3, t):
    return (
        (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0]
        + 3 * (1 - t) * t**2 * p2[0] + t**3 * p3[0],
        (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1]
        + 3 * (1 - t) * t**2 * p2[1] + t**3 * p3[1],
    )

# Commands parsed from: M302 213 c.. c.. s.. c.. l.. c.. c.. s.. c.. l.. z
subs = [
    # (p0, p1, p2, p3) cubic segments
    ((302, 213), (290, 200), (274, 193), (254, 193)),
    ((254, 193), (215, 193), (187, 220), (187, 257)),
    ((187, 257), (187, 294), (215, 321), (254, 321)),
    ((254, 321), (274, 321), (291, 314), (303, 300)),
    # line (303,300)->(278,276) as near-degenerate cubic
    ((303, 300), (297, 294), (285, 282), (278, 276)),
    ((278, 276), (272, 283), (264, 287), (254, 287)),
    ((254, 287), (237, 287), (225, 275), (225, 257)),
    ((225, 257), (225, 239), (237, 227), (254, 227)),
    ((254, 227), (264, 227), (272, 231), (278, 238)),
    # line (278,238)->(302,213)
    ((278, 238), (286, 229), (294, 221), (302, 213)),
]
face_pts = []
for seg in subs:
    for k in range(21):
        face_pts.append(cubic(*seg, k / 20))
face_pts = [(C(x), C(y)) for x, y in face_pts]
d.polygon(face_pts, fill=DARK)

# 6. Green circle cx=339 cy=256 r=20
d.ellipse(
    [C(339) - C(20), C(256) - C(20), C(339) + C(20), C(256) + C(20)],
    fill=GREEN,
)

img_1024 = img
img_1024.save("web/frontend/public/pwa/cals-icon-1024.png")
img_512 = img_1024.resize((512, 512), Image.LANCZOS)
img_512.save("web/frontend/public/pwa/cals-icon-512.png")
print("saved cals-icon-1024.png and cals-icon-512.png")
