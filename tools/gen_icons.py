from pathlib import Path

from PIL import Image

if __name__ == '__main__':
    sizes = [
        (32, 'logo-domino-32.png'),
        (192, 'logo-domino-192.png'),
        (512, 'logo-domino-512.png'),
        (1024, 'logo-domino-1024.png'),
    ]
    icons_dir = Path(__file__).resolve().parent.parent / 'icons'
    source = icons_dir / 'logo-domino.png'

    with Image.open(source) as logo:
        logo = logo.convert('RGBA')
        for size, name in sizes:
            icon = logo.resize((size, size), Image.Resampling.LANCZOS)
            path = icons_dir / name
            icon.save(path, 'PNG', optimize=True)
            print(f'{path}  {size}x{size}')
