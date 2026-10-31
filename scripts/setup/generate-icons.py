import os
from PIL import Image, ImageDraw

ASSETS_ICON = "assets/icon.png"
SRC_ASSETS_DIR = "src/assets"

# Android legacy icons (48dp base)
ANDROID_LEGACY_SIZES = {
    "android/app/src/main/res/mipmap-mdpi": 48,
    "android/app/src/main/res/mipmap-hdpi": 72,
    "android/app/src/main/res/mipmap-xhdpi": 96,
    "android/app/src/main/res/mipmap-xxhdpi": 144,
    "android/app/src/main/res/mipmap-xxxhdpi": 192,
}

# Android adaptive foreground icons (108dp base)
ANDROID_ADAPTIVE_SIZES = {
    "android/app/src/main/res/mipmap-mdpi": 108,
    "android/app/src/main/res/mipmap-hdpi": 162,
    "android/app/src/main/res/mipmap-xhdpi": 216,
    "android/app/src/main/res/mipmap-xxhdpi": 324,
    "android/app/src/main/res/mipmap-xxxhdpi": 432,
}

IOS_ICONS = {
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_20_2x.png": 40,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_20_3x.png": 60,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_29_2x.png": 58,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_29_3x.png": 87,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_40_2x.png": 80,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_40_3x.png": 120,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_60_2x.png": 120,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_60_3x.png": 180,
    "ios/ExpenseTracker/Images.xcassets/AppIcon.appiconset/icon_1024.png": 1024,
}

def create_round_icon(image, size):
    """Generates a full-bleed circular icon with no empty padding."""
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    
    round_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    round_img.paste(resized, (0, 0), mask=mask)
    return round_img

def create_adaptive_foreground(image, canvas_size, scale=0.82):
    """
    Creates Android adaptive icon foreground layer (108dp base).
    Scales the cropped image so that inside the 72dp viewport mask
    the icon occupies 100% of the area with no dead borders.
    """
    s = int(canvas_size * scale)
    resized = image.resize((s, s), Image.Resampling.LANCZOS)
    
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset = ((canvas_size - s) // 2, (canvas_size - s) // 2)
    canvas.paste(resized, offset, mask=resized)
    return canvas

def create_ios_icon(image, size):
    """Creates opaque iOS icon on deep finance emerald backdrop (Apple requirement)."""
    # Background gradient or matching deep tone
    bg = Image.new("RGBA", (size, size), (5, 33, 25, 255))
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    bg.paste(resized, (0, 0), mask=resized)
    return bg.convert("RGB")

def main():
    if not os.path.exists(ASSETS_ICON):
        print(f"Error: {ASSETS_ICON} does not exist.")
        return

    raw_img = Image.open(ASSETS_ICON).convert("RGBA")
    
    # Crop tightly to non-transparent bounding box so the wallet fills 100% of the box
    bbox = raw_img.getbbox()
    if bbox:
        cropped = raw_img.crop(bbox)
    else:
        cropped = raw_img

    print(f"Tight cropped wallet dimensions: {cropped.size}")

    # Re-save master icon without the 52px padding
    master = cropped.resize((512, 512), Image.Resampling.LANCZOS)
    master.save("assets/icon.png", "PNG")
    os.makedirs(SRC_ASSETS_DIR, exist_ok=True)
    master.save(os.path.join(SRC_ASSETS_DIR, "icon.png"), "PNG")
    print("Updated master assets/icon.png and src/assets/icon.png (tight crop, 512x512)")

    # 1. Android Legacy Icons (ic_launcher.png & ic_launcher_round.png)
    for mipmap_path, size in ANDROID_LEGACY_SIZES.items():
        os.makedirs(mipmap_path, exist_ok=True)
        
        # Standard launcher icon (100% full bleed, no empty borders)
        resized = cropped.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(mipmap_path, "ic_launcher.png"), "PNG")
        
        # Round launcher icon (100% full circular fill)
        round_icon = create_round_icon(cropped, size)
        round_icon.save(os.path.join(mipmap_path, "ic_launcher_round.png"), "PNG")
        print(f"Generated Android legacy {mipmap_path} ({size}x{size})")

    # 2. Android Adaptive Icon Foregrounds (ic_launcher_foreground.png)
    for mipmap_path, size in ANDROID_ADAPTIVE_SIZES.items():
        fg = create_adaptive_foreground(cropped, size, scale=0.82)
        fg.save(os.path.join(mipmap_path, "ic_launcher_foreground.png"), "PNG")
        print(f"Generated Android adaptive foreground {mipmap_path}/ic_launcher_foreground.png ({size}x{size})")

    # 3. iOS Icons
    for icon_path, size in IOS_ICONS.items():
        dir_name = os.path.dirname(icon_path)
        if os.path.exists(dir_name):
            ios_icon = create_ios_icon(cropped, size)
            ios_icon.save(icon_path, "PNG")
            print(f"Generated iOS {icon_path} ({size}x{size})")

    print("\nAll icons successfully generated with full-bleed dimensions and adaptive icon support!")

if __name__ == "__main__":
    main()
