from PIL import Image, ImageDraw

BG = (18, 21, 29)
IVORY = (244, 239, 228)
GOLD = (232, 178, 61)
DOT = (26, 31, 43)

def draw_domino(draw, cx, cy, tile_size, dot_radius):
    half = tile_size // 2
    margin = tile_size // 8
    t = margin
    r = 12 * tile_size // 192

    draw.rounded_rectangle(
        [cx - half + t, cy - half + t, cx + half - t, cy + half - t],
        radius=r, fill=IVORY, outline=GOLD, width=max(2, tile_size // 48)
    )

    div_y = cy
    draw.line([(cx - half + t, div_y), (cx + half - t, div_y)], fill=DOT, width=max(1, tile_size // 72))

    def dot(cx, cy):
        dr = dot_radius
        draw.ellipse([cx - dr, cy - dr, cx + dr, cy + dr], fill=DOT)

    top_center_y = cy - half // 2
    bot_center_y = cy + half // 2

    # top: 5 dots (quincunx)
    dot(cx, top_center_y)
    dot(cx - half // 3, top_center_y - half // 4)
    dot(cx + half // 3, top_center_y - half // 4)
    dot(cx - half // 3, top_center_y + half // 4)
    dot(cx + half // 3, top_center_y + half // 4)

    # bottom: 2 dots (vertical)
    dot(cx, bot_center_y - half // 5)
    dot(cx, bot_center_y + half // 5)

def make_icon(size):
    img = Image.new('RGBA', (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)

    # rounded bg
    r = size // 6
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG + (255,))

    tile_size = size * 5 // 8
    dot_radius = max(3, size // 16)
    draw_domino(draw, size // 2, size // 2, tile_size, dot_radius)

    return img

if __name__ == '__main__':
    sizes = [(32, 'favicon.png'), (192, 'icon-192.png'), (512, 'icon-512.png'), (1024, 'icon-1024.png')]
    icons_dir = '/Volumes/STORAGE_250/Projetos/dominoduel/icons'
    for s, name in sizes:
        img = make_icon(s)
        path = f'{icons_dir}/{name}'
        img.save(path, 'PNG')
        print(f'{path}  {s}x{s}')
