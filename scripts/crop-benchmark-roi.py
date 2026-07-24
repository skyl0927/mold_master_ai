from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--x", type=float, required=True)
    parser.add_argument("--y", type=float, required=True)
    parser.add_argument("--width", type=float, required=True)
    parser.add_argument("--height", type=float, required=True)
    parser.add_argument("--padding", type=float, default=0.08)
    args = parser.parse_args()

    with Image.open(args.input) as image:
        image.load()
        pad_x = args.width * args.padding
        pad_y = args.height * args.padding
        left = max(0.0, args.x - pad_x)
        top = max(0.0, args.y - pad_y)
        right = min(1.0, args.x + args.width + pad_x)
        bottom = min(1.0, args.y + args.height + pad_y)
        box = (
            round(left * image.width),
            round(top * image.height),
            round(right * image.width),
            round(bottom * image.height),
        )
        cropped = image.crop(box)
        if cropped.mode not in {"RGB", "RGBA"}:
            cropped = cropped.convert("RGB")
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        cropped.save(args.output, format="PNG")


if __name__ == "__main__":
    main()
