#!/usr/bin/env python3
"""
PrintBooth Branding & SEO Asset Generator
Generates transparent logo, favicons (ICO, SVG, PNG), apple touch icon,
and 1200x630 Open Graph / Twitter Card SEO images.
"""

import os
import shutil
import base64
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(ROOT_DIR, 'logo_transparent.png')

def main():
    if not os.path.exists(LOGO_PATH):
        print(f"Error: {LOGO_PATH} not found.")
        return

    src = Image.open(LOGO_PATH).convert('RGBA')
    src_w, src_h = src.size
    print(f"Loaded logo mark: {src_w}x{src_h}")

    # 1. Square Icon 512x512
    icon_512 = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    scale = min(460.0 / src_w, 460.0 / src_h)
    new_w, new_h = int(src_w * scale), int(src_h * scale)
    src_scaled = src.resize((new_w, new_h), Image.Resampling.LANCZOS)
    pos_x = (512 - new_w) // 2
    pos_y = (512 - new_h) // 2
    icon_512.paste(src_scaled, (pos_x, pos_y), src_scaled)

    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    icon_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    icon_64 = icon_512.resize((64, 64), Image.Resampling.LANCZOS)
    icon_48 = icon_512.resize((48, 48), Image.Resampling.LANCZOS)
    icon_32 = icon_512.resize((32, 32), Image.Resampling.LANCZOS)
    icon_16 = icon_512.resize((16, 16), Image.Resampling.LANCZOS)

    icon_192.save(os.path.join(ROOT_DIR, 'logo_192.png'))
    icon_32.save(os.path.join(ROOT_DIR, 'favicon_32.png'))
    icon_180.save(os.path.join(ROOT_DIR, 'apple-touch-icon.png'))

    # 3. Multi-resolution favicon.ico
    ico_path = os.path.join(ROOT_DIR, 'favicon.ico')
    icon_64.save(ico_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)], append_images=[icon_48, icon_32, icon_16])

    # 4. SVG Favicon
    icon_512_bytes = os.path.join(ROOT_DIR, 'logo-512.png')
    icon_512.save(icon_512_bytes)
    with open(icon_512_bytes, 'rb') as f:
        b64_data = base64.b64encode(f.read()).decode('utf-8')

    svg_favicon_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_data}" width="512" height="512" />
</svg>'''
    svg_favicon_path = os.path.join(ROOT_DIR, 'favicon.svg')
    with open(svg_favicon_path, 'w', encoding='utf-8') as f:
        f.write(svg_favicon_content)

    # 5. Open Graph / Twitter SEO Card (1200 x 630)
    base_card = Image.new('RGBA', (1200, 630), (10, 11, 14, 255))
    glow_layer = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)

    # Soft radial glow behind logo on the left
    for r in range(400, 0, -5):
        factor = (1.0 - (r / 400.0)) ** 2
        a = int(60 * factor)
        glow_draw.ellipse([290 - r, 315 - r, 290 + r, 315 + r], fill=(220, 38, 38, a))

    grid_layer = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid_layer)
    for x in range(0, 1200, 60):
        grid_draw.line([(x, 0), (x, 630)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, 630, 60):
        grid_draw.line([(0, y), (1200, y)], fill=(255, 255, 255, 8), width=1)

    og_img = Image.alpha_composite(base_card, glow_layer)
    og_img = Image.alpha_composite(og_img, grid_layer)
    draw = ImageDraw.Draw(og_img)

    # Place Logo Mark on the left (scaled to 360x380)
    og_scale = min(360.0 / src_w, 380.0 / src_h)
    og_logo_w, og_logo_h = int(src_w * og_scale), int(src_h * og_scale)
    og_logo = src.resize((og_logo_w, og_logo_h), Image.Resampling.LANCZOS)
    og_img.paste(og_logo, (85 + (360 - og_logo_w) // 2, (630 - og_logo_h) // 2), og_logo)

    # Text content on the right
    # Try system fonts (Segoe UI, Arial, Trebuchet)
    def load_font(size, bold=False):
        font_names = [
            'C:\\Windows\\Fonts\\segoeuib.ttf' if bold else 'C:\\Windows\\Fonts\\segoeui.ttf',
            'C:\\Windows\\Fonts\\arialbd.ttf' if bold else 'C:\\Windows\\Fonts\\arial.ttf',
            'C:\\Windows\\Fonts\\calibrib.ttf' if bold else 'C:\\Windows\\Fonts\\calibri.ttf',
        ]
        for fn in font_names:
            if os.path.exists(fn):
                try:
                    return ImageFont.truetype(fn, size)
                except:
                    pass
        return ImageFont.load_default()

    font_brand = load_font(68, bold=True)
    font_badge = load_font(15, bold=True)
    font_sub_title = load_font(30, bold=True)
    font_sub = load_font(21, bold=False)
    font_pills = load_font(16, bold=True)
    font_domain = load_font(20, bold=True)

    text_x = 510

    # Badge Pill: "AUTONOMOUS CLOUD KIOSKS"
    badge_rect = [text_x, 115, text_x + 310, 148]
    draw.rounded_rectangle(badge_rect, radius=8, fill=(220, 38, 38, 45), outline=(220, 38, 38, 160), width=1)
    draw.text((text_x + 16, 123), "AUTONOMOUS CLOUD KIOSKS", fill=(248, 113, 113, 255), font=font_badge)

    # Brand Title: "PrintBooth"
    draw.text((text_x, 168), "PrintBooth", fill=(255, 255, 255, 255), font=font_brand)
    # Accent red dot on brand
    draw.text((text_x + 348, 168), "•", fill=(220, 38, 38, 255), font=font_brand)

    # Taglines
    draw.text((text_x, 262), "Self-Service Printing Made Simple.", fill=(241, 245, 249, 255), font=font_sub_title)
    draw.text((text_x, 308), "Direct phone browser upload • Instant UPI QR • Under 90s release", fill=(148, 163, 184, 255), font=font_sub)

    # Feature Pills
    features = ["Instant QR Upload", "Universal UPI", "Zero App Download"]
    pill_x = text_x
    pill_y = 375
    for feat in features:
        bbox = draw.textbbox((0, 0), feat, font=font_pills)
        tw = bbox[2] - bbox[0]
        pw = tw + 28
        draw.rounded_rectangle([pill_x, pill_y, pill_x + pw, pill_y + 36], radius=18, fill=(30, 41, 59, 220), outline=(51, 65, 85, 240), width=1)
        draw.ellipse([pill_x + 10, pill_y + 14, pill_x + 18, pill_y + 22], fill=(34, 197, 94, 255))
        draw.text((pill_x + 24, pill_y + 8), feat, fill=(241, 245, 249, 255), font=font_pills)
        pill_x += pw + 12

    # Domain Footer
    draw.text((text_x, 460), "printbooth.in", fill=(220, 38, 38, 255), font=font_domain)

    og_png_path = os.path.join(ROOT_DIR, 'og-image.png')
    og_img.convert('RGB').save(og_png_path, quality=95)
    print(f"Generated SEO card: {og_png_path}")

    # Copy files to public directories of apps
    targets = [
        os.path.join(ROOT_DIR, 'apps', 'web', 'public'),
        os.path.join(ROOT_DIR, 'apps', 'admin', 'public'),
        os.path.join(ROOT_DIR, 'kiosk', 'ui', 'public'),
    ]

    for target_dir in targets:
        os.makedirs(target_dir, exist_ok=True)
        # Copy transparent logo
        shutil.copyfile(os.path.join(ROOT_DIR, 'logo_transparent.png'), os.path.join(target_dir, 'logo.png'))
        shutil.copyfile(os.path.join(ROOT_DIR, 'logo-512.png'), os.path.join(target_dir, 'logo-512.png'))
        # Copy favicons
        shutil.copyfile(ico_path, os.path.join(target_dir, 'favicon.ico'))
        shutil.copyfile(svg_favicon_path, os.path.join(target_dir, 'favicon.svg'))
        shutil.copyfile(os.path.join(ROOT_DIR, 'logo_192.png'), os.path.join(target_dir, 'favicon-192.png'))
        shutil.copyfile(os.path.join(ROOT_DIR, 'favicon_32.png'), os.path.join(target_dir, 'favicon-32x32.png'))
        shutil.copyfile(os.path.join(ROOT_DIR, 'favicon_32.png'), os.path.join(target_dir, 'favicon-16x16.png'))
        # Copy apple touch icon
        icon_180.save(os.path.join(target_dir, 'apple-touch-icon.png'))
        # Copy SEO image to web and admin
        shutil.copyfile(og_png_path, os.path.join(target_dir, 'og-image.png'))
        print(f"Copied branding assets to {target_dir}")

    # Also save root logo.png with background removed
    shutil.copyfile(os.path.join(ROOT_DIR, 'logo_transparent.png'), os.path.join(ROOT_DIR, 'logo.png'))
    print("[OK] Successfully updated all logo, favicon, and SEO assets across the system.")

if __name__ == '__main__':
    main()
