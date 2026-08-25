#!/usr/bin/env python3
"""
One-off isolated cadastral-page enhancement and OCR utility.

The source image is never overwritten. It writes several readable variants,
runs independent OCR on each variant, and records the complete responses for
manual comparison. No output is connected to Know Your Prop.
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


MISTRAL_OCR_MODEL = "mistral-ocr-latest"
MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"
ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
UPSCALE = 4

# Source-pixel regions intentionally overlap at plot boundaries. Smaller visual
# contexts make handwritten labels more legible than a single full-page pass.
REVIEW_REGIONS = {
    "upper_left": (0, 0, 190, 400),
    "lower_left": (0, 330, 205, 862),
    "central_narrow_parcels": (100, 45, 275, 610),
    "upper_right": (220, 0, 438, 475),
    "lower_right": (195, 390, 438, 862),
}


def run_magick(*args: str) -> None:
    result = subprocess.run(["magick", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"ImageMagick failed: {result.stderr.strip()[:400]}")


def image_dimensions(path: str) -> tuple[int, int]:
    result = subprocess.run(
        ["magick", "identify", "-format", "%wx%h", path],
        capture_output=True,
        text=True,
        check=True,
    )
    width, height = result.stdout.strip().split("x")
    return int(width), int(height)


def make_variants(source: str, out_dir: Path) -> list[Path]:
    variants = {
        "original_upscaled": [
            "-filter", "Lanczos", "-resize", f"{UPSCALE * 100}%", "-quality", "95",
        ],
        "grayscale_sharp": [
            "-colorspace", "Gray", "-filter", "Lanczos",
            "-resize", f"{UPSCALE * 100}%", "-contrast-stretch", "1%x1%",
            "-unsharp", "0x1",
        ],
        "high_contrast": [
            "-colorspace", "Gray", "-filter", "Lanczos",
            "-resize", f"{UPSCALE * 100}%", "-auto-level",
            "-sigmoidal-contrast", "5,50%", "-unsharp", "0x1",
        ],
    }
    paths = []
    for name, args in variants.items():
        destination = out_dir / f"{name}.jpg"
        run_magick(source, *args, "-quality", "95", "-strip", str(destination))
        paths.append(destination)
    return paths


def make_review_regions(source: str, out_dir: Path) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for name, (x0, y0, x1, y1) in REVIEW_REGIONS.items():
        destination = out_dir / f"region_{name}.jpg"
        run_magick(
            source,
            "-crop", f"{x1 - x0}x{y1 - y0}+{x0}+{y0}",
            "+repage", "-filter", "Lanczos", "-resize", f"{UPSCALE * 100}%",
            "-contrast-stretch", "1%x1%", "-unsharp", "0x1", "-quality", "95", "-strip",
            str(destination),
        )
        paths[name] = destination
    return paths


def mistral_ocr(image_path: str, api_key: str) -> dict:
    with open(image_path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode()
    extension = Path(image_path).suffix.lower().lstrip(".")
    mime = "image/jpeg" if extension in ("jpg", "jpeg") else f"image/{extension}"
    payload = json.dumps({
        "model": MISTRAL_OCR_MODEL,
        "document": {
            "type": "image_url",
            "image_url": f"data:{mime};base64,{encoded}",
        },
    }).encode()
    request = urllib.request.Request(
        MISTRAL_OCR_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            last_error = RuntimeError(f"Mistral OCR HTTP {exc.code}: {body[:400]}")
            if exc.code not in (429, 500, 502, 503):
                raise last_error
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = RuntimeError(f"Mistral OCR network error: {exc}")
        time.sleep(2 * (attempt + 1))
    raise last_error or RuntimeError("Mistral OCR failed without an error")


def response_text(response: dict) -> str:
    return "\n\n".join(
        page.get("markdown", "") for page in (response.get("pages") or [])
    ).strip()


def claude_vision_transcription(
    source_width: int,
    source_height: int,
    variants: list[Path],
    api_key: str,
) -> tuple[dict, str]:
    """Ask for a grounded, parcel-by-parcel visual reading across the variants."""
    content: list[dict] = [{
        "type": "text",
        "text": f"""You are reviewing one small, hand-drawn cadastral-map crop.
The next three images are the SAME crop rendered as color upscale, grayscale
sharpening, and high contrast. Read them together; do not invent labels.

Extract every handwritten number, fraction, or short numeric label that is
visibly readable. Focus on labels inside or immediately adjacent to parcel
boundaries. Do not treat yellow highlighting as a label. For every item return
an approximate bounding box in NORMALIZED coordinates: x0,y0,x1,y1 are integers
from 0 to 1000, with (0,0) at the top-left and (1000,1000) at the bottom-right.
The original source image is {source_width}×{source_height} pixels.

Use "high" only when the digits are plainly readable in the images, "medium"
when most digits are clear but one is uncertain, and "low" when it is a useful
possible reading but needs human verification. Do not guess missing digits.
Include a short location description (for example, "right column, upper box").

Return ONLY valid JSON in this schema:
{{
  "labels": [
    {{
      "text": "verbatim visible label",
      "confidence": "high|medium|low",
      "bbox_normalized": {{"x0": 0, "y0": 0, "x1": 0, "y1": 0}},
      "location": "brief location",
      "notes": "why this reading is or is not certain"
    }}
  ],
  "unreadable_areas": ["brief locations that need a cleaner source"],
  "overall_note": "short caution about the transcription"
}}""",
    }]
    for variant in variants:
        with variant.open("rb") as handle:
            encoded = base64.b64encode(handle.read()).decode()
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": encoded,
            },
        })

    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 12000,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    request = urllib.request.Request(
        ANTHROPIC_MESSAGES_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            raw = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"Claude vision HTTP {exc.code}: {body[:600]}") from exc
    text = "".join(
        block.get("text", "") for block in raw.get("content", [])
        if block.get("type") == "text"
    ).strip()
    if raw.get("stop_reason") == "max_tokens" or not text:
        raise RuntimeError("Claude vision returned truncated or empty transcription")
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned), text
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Claude vision returned non-JSON text: {text[:400]}") from exc


def claude_region_transcription(
    regions: dict[str, Path],
    api_key: str,
) -> dict:
    """Read smaller clusters and prohibit the model from completing unclear text."""
    content: list[dict] = [{
        "type": "text",
        "text": """These are overlapping, enlarged regions of a single
hand-drawn cadastral-map crop. Each following image is named in its preceding
text block. Read the labels literally.

For each named region, list ONLY handwritten numeric labels, fractions, or
short numeric notations you can visibly read. List them in top-to-bottom,
then left-to-right order. Never fill in a missing digit from a presumed
sequence. If a mark is present but cannot be read literally, put it in
"unreadable" rather than guessing. Do not include labels merely because they
appear in another region; duplicates from overlapping regions are acceptable.

Return ONLY valid JSON:
{
  "regions": {
    "region_name": {
      "readings": [
        {"text": "literal visible text", "confidence": "high|medium|low",
         "position": "brief local position", "notes": "brief evidence/caveat"}
      ],
      "unreadable": ["brief locations of marks that cannot be read"],
      "note": "optional short region-level caution"
    }
  }
}""",
    }]
    for name, path in regions.items():
        content.append({"type": "text", "text": f"Region: {name}"})
        with path.open("rb") as handle:
            encoded = base64.b64encode(handle.read()).decode()
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": encoded,
            },
        })

    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 12000,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    request = urllib.request.Request(
        ANTHROPIC_MESSAGES_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            raw = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"Claude regional vision HTTP {exc.code}: {body[:600]}") from exc
    text = "".join(
        block.get("text", "") for block in raw.get("content", [])
        if block.get("type") == "text"
    ).strip()
    if raw.get("stop_reason") == "max_tokens" or not text:
        raise RuntimeError("Claude regional vision returned truncated or empty text")
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Claude regional vision returned non-JSON text: {text[:400]}") from exc


def write_report(results: dict[str, dict], destination: Path, source: str) -> None:
    with destination.open("w") as handle:
        handle.write("# Attached cadastral crop — enhancement and OCR comparison\n\n")
        handle.write(f"- Source: `{source}`\n")
        handle.write(f"- Enlargement: {UPSCALE}×\n")
        handle.write(
            "- OCR note: these are independent readings of three image variants. "
            "Mistral OCR does not provide word-level confidence or coordinates, so "
            "the text should be verified against the clean enhanced images before "
            "any parcel-line overlay is treated as authoritative.\n\n"
        )
        for index, (name, result) in enumerate(results.items()):
            handle.write(f"## {name}\n\n")
            handle.write(f"- Image: `{result['image']}`\n")
            handle.write(
                f"- Size: {result['width']}×{result['height']} px\n"
            )
            handle.write("\n### Complete OCR text\n\n```text\n")
            handle.write(result["ocr_text"])
            if result["ocr_text"] and not result["ocr_text"].endswith("\n"):
                handle.write("\n")
            handle.write("```")
            if index < len(results) - 1:
                handle.write("\n\n")


def write_vision_report(transcription: dict, destination: Path) -> None:
    with destination.open("w") as handle:
        handle.write("# Parcel-label visual transcription — review draft\n\n")
        handle.write(
            "This is a visual-model reading of the enhanced crop. It is a review "
            "aid, not a replacement for the underlying map. Only entries marked "
            "`high` should be considered eligible for a later overlay without "
            "manual confirmation.\n\n"
        )
        handle.write("## Labels\n\n")
        for item in transcription.get("labels", []):
            bbox = item.get("bbox_normalized", {})
            handle.write(
                f"- **{item.get('text', '?')}** — {item.get('confidence', 'low')} "
                f"confidence; {item.get('location', 'location not supplied')} "
                f"(normalized box: {bbox}). {item.get('notes', '')}\n"
            )
        unreadable = transcription.get("unreadable_areas") or []
        if unreadable:
            handle.write("\n## Still unreadable / needs source verification\n\n")
            for area in unreadable:
                handle.write(f"- {area}\n")
        if transcription.get("overall_note"):
            handle.write(f"\n## Overall note\n\n{transcription['overall_note']}\n")


def write_region_report(transcription: dict, destination: Path) -> None:
    with destination.open("w") as handle:
        handle.write("# Parcel-label transcription — region-by-region review\n\n")
        handle.write(
            "Each region below is an independent 4× enhancement of a smaller "
            "part of the source crop. Readings are literal visual candidates, "
            "not inferred sequence values. Overlap between regions may repeat a "
            "label. This report is the safer basis for a future plot-line overlay.\n\n"
        )
        regions = list(transcription.get("regions", {}).items())
        for index, (name, result) in enumerate(regions):
            handle.write(f"## {name}\n\n")
            readings = result.get("readings") or []
            if readings:
                for reading in readings:
                    handle.write(
                        f"- **{reading.get('text', '?')}** — "
                        f"{reading.get('confidence', 'low')} confidence; "
                        f"{reading.get('position', 'position not supplied')}. "
                        f"{reading.get('notes', '')}\n"
                    )
            else:
                handle.write("- No confidently readable numeric labels returned.\n")
            unreadable = result.get("unreadable") or []
            if unreadable:
                handle.write("\nStill unreadable:\n")
                for item in unreadable:
                    handle.write(f"- {item}\n")
            if result.get("note"):
                handle.write(f"\nNote: {result['note']}\n")
            if index < len(regions) - 1:
                handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enhance and independently OCR an isolated cadastral crop"
    )
    parser.add_argument("image", help="Attached cadastral crop image")
    parser.add_argument(
        "--out-dir",
        default="research/cadastral_ocr/output/page_5309",
    )
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY", "").strip()
    if not api_key:
        sys.exit("ERROR: MISTRAL_API_KEY environment variable is not set.")
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_api_key:
        sys.exit("ERROR: ANTHROPIC_API_KEY environment variable is not set.")
    if not os.path.isfile(args.image):
        sys.exit(f"ERROR: image not found: {args.image}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    width, height = image_dimensions(args.image)
    results_path = out_dir / "ocr_results.json"
    results: dict[str, dict] = {}
    if results_path.exists() and not args.no_cache:
        with results_path.open() as handle:
            results = json.load(handle)

    print(f"Source: {args.image} ({width}x{height}px)", flush=True)
    variant_paths = make_variants(args.image, out_dir)
    for variant_path in variant_paths:
        name = variant_path.stem
        if name in results and not args.no_cache:
            print(f"  {name}: cached", flush=True)
            continue
        variant_width, variant_height = image_dimensions(str(variant_path))
        print(f"  {name}: independent OCR ... ", end="", flush=True)
        response = mistral_ocr(str(variant_path), api_key)
        text = response_text(response)
        results[name] = {
            "image": str(variant_path),
            "width": variant_width,
            "height": variant_height,
            "ocr_text": text,
        }
        with results_path.open("w") as handle:
            json.dump(results, handle, indent=2, ensure_ascii=False)
        print(f"ok ({len(text)} chars)", flush=True)
        time.sleep(0.25)

    ordered = {name: results[name] for name in (
        "original_upscaled", "grayscale_sharp", "high_contrast"
    ) if name in results}
    with results_path.open("w") as handle:
        json.dump(ordered, handle, indent=2, ensure_ascii=False)
    report_path = out_dir / "ocr_comparison_report.md"
    write_report(ordered, report_path, args.image)
    regions = make_review_regions(args.image, out_dir)
    regional_path = out_dir / "regional_transcription.json"
    regional_report_path = out_dir / "regional_transcription_report.md"
    if regional_path.exists() and not args.no_cache:
        regional = json.loads(regional_path.read_text())
        print("Regional visual transcription: cached", flush=True)
    else:
        print("Region-by-region visual transcription ... ", end="", flush=True)
        regional = claude_region_transcription(regions, anthropic_api_key)
        regional_path.write_text(json.dumps(regional, indent=2, ensure_ascii=False))
        count = sum(
            len(value.get("readings") or [])
            for value in regional.get("regions", {}).values()
        )
        print(f"ok ({count} readings)", flush=True)
    write_region_report(regional, regional_report_path)
    print(f"\nResults: {results_path}", flush=True)
    print(f"Report: {report_path}", flush=True)
    print(f"Regional transcription: {regional_report_path}", flush=True)
    print(f"Variants: {out_dir}", flush=True)


if __name__ == "__main__":
    main()