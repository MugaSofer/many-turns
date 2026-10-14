"""Montage images into a labelled contact sheet: python contact.py out.jpg cols width img1 img2 ..."""
import sys, os
from PIL import Image, ImageDraw
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]; h = int(w * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols; sheet = Image.new('RGB', (cols * w, rows * (h + 22)), 'white'); d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(im.resize((w, h)), (x, y + 22)); d.text((x + 4, y + 4), os.path.basename(f), fill='black')
sheet.save(out, quality=88)
