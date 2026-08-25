#!/usr/bin/env python3
"""
Refine the candidate regions from scan_murrabba_39.py.

This intentionally reads the original source image and candidates.tsv. It
never reads annotated_map.jpg, so labels and colored detection boxes cannot
leak into the crop or its OCR.

Usage:
    python3 research/cadastral_ocr/refine_candidate_crops.py \
        attached_assets/Pind_Mustafabad_Map_1787179833079.jpeg

Outputs under research/cadastral_ocr/output/candidate_crops/:
    candidate_01.jpg ... candidate_15.jpg  4x crops from the original image
    candidate_01_ocr.txt ...              full OCR text per crop
    results.json                          coordinates, text, and number tokens
"""

import argparse
import base64
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


MISTRAL_OCR_MODEL = "mistral-ocr-latest"
MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"
UPSCALE = 4


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


def crop_and_enlarge(
    source: str,
    destination: str,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
) -> tuple[int, int]:
    width, height = x1 - x0, y1 - y0
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid crop bounds: {(x0, y0, x1, y1)}")
    run_magick(
        source,
        "-crop",
        f"{width}x{height}+{x0}+{y0}",
        "+repage",
        "-filter",
        "Lanczos",
        "-resize",
        f"{UPSCALE * 100}%",
        "-quality",
        "92",
        "-strip",
        destination,
    )
    return width * UPSCALE, height * UPSCALE


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


def number_tokens(text: str) -> list[str]:
    """Keep every numeric token in OCR order, including repeats and fractions."""
    return re.findall(r"(?<![A-Za-z])\d+(?:[./-]\d+)*(?![A-Za-z])", text)


def load_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    required = {"#", "src_x0", "src_y0", "src_x1", "src_y1"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"{path} is missing required candidate columns: {required}")
    return sorted(rows, key=lambda row: int(row["#"]))


def write_report(results: dict[str, dict], destination: Path) -> None:
    """Write all OCR output verbatim, rather than a summary limited to '39'."""
    with destination.open("w") as handle:
        handle.write("# Candidate crop OCR results\n\n")
        handle.write(
            "Each crop was taken directly from the original map at the saved "
            "source bounds, then enlarged 4× before its independent OCR pass. "
            "The OCR text below is unabridged.\n\n"
        )
        keys = sorted(results, key=lambda item: int(item))
        for index, key in enumerate(keys):
            result = results[key]
            bounds = result["source_bounds"]
            source_size = result["source_size"]
            enlarged_size = result["enlarged_size"]
            handle.write(f"## Candidate {key}\n\n")
            handle.write(
                f"- Source bounds: `({bounds['x0']}, {bounds['y0']})–"
                f"({bounds['x1']}, {bounds['y1']})`\n"
            )
            handle.write(
                f"- Crop size: {source_size['width']}×{source_size['height']} px; "
                f"enlarged: {enlarged_size['width']}×{enlarged_size['height']} px\n"
            )
            handle.write(
                f"- Detected numbers ({len(result['detected_numbers'])}, OCR order): "
                f"`{', '.join(result['detected_numbers']) or '(none)'}`\n\n"
            )
            handle.write("### Full OCR text\n\n")
            handle.write("```text\n")
            handle.write(result["ocr_text"])
            if result["ocr_text"] and not result["ocr_text"].endswith("\n"):
                handle.write("\n")
            handle.write("```\n")
            if index < len(keys) - 1:
                handle.write("\n")


def write_archive(out_dir: Path, results_path: Path, report_path: Path) -> Path:
    """Package every independently saved crop and its full OCR output."""
    archive_path = out_dir / "candidate_crops.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(results_path, results_path.name)
        archive.write(report_path, report_path.name)
        for crop_path in sorted(out_dir.glob("candidate_*.jpg")):
            archive.write(crop_path, crop_path.name)
        for text_path in sorted(out_dir.glob("candidate_*_ocr.txt")):
            archive.write(text_path, text_path.name)
    return archive_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crop and independently OCR the 15 saved candidate regions"
    )
    parser.add_argument("image", help="Original cadastral map, not annotated_map.jpg")
    parser.add_argument(
        "--out-dir",
        default="research/cadastral_ocr/output/candidate_crops",
    )
    parser.add_argument(
        "--candidates",
        default="research/cadastral_ocr/output/candidates.tsv",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Recreate crops and repeat OCR even when results already exist",
    )
    parser.add_argument(
        "--refresh-images",
        action="store_true",
        help="Recreate metadata-free crop images while retaining cached OCR results",
    )
    args = parser.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY", "").strip()
    if not api_key:
        sys.exit("ERROR: MISTRAL_API_KEY environment variable is not set.")
    if not os.path.isfile(args.image):
        sys.exit(f"ERROR: original image not found: {args.image}")

    source_width, source_height = image_dimensions(args.image)
    candidates_path = Path(args.candidates)
    if not candidates_path.exists():
        sys.exit(f"ERROR: candidate table not found: {candidates_path}")
    candidates = load_candidates(candidates_path)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "results.json"
    results: dict[str, dict] = {}
    if results_path.exists() and not args.no_cache:
        with results_path.open() as handle:
            results = json.load(handle)

    print(
        f"Original: {args.image} ({source_width}x{source_height}px)\n"
        f"Candidates: {len(candidates)} from {candidates_path}\n"
        f"Output: {out_dir}",
        flush=True,
    )

    for row in candidates:
        number = int(row["#"])
        key = f"{number:02d}"
        crop_path = out_dir / f"candidate_{key}.jpg"
        text_path = out_dir / f"candidate_{key}_ocr.txt"
        x0, y0 = int(row["src_x0"]), int(row["src_y0"])
        x1, y1 = int(row["src_x1"]), int(row["src_y1"])
        if not (0 <= x0 < x1 <= source_width and 0 <= y0 < y1 <= source_height):
            raise ValueError(f"Candidate #{number} is outside source image: {row}")

        cached = results.get(key)
        if (
            cached
            and crop_path.exists()
            and text_path.exists()
            and not args.no_cache
            and not args.refresh_images
        ):
            print(f"  candidate_{key}: cached", flush=True)
            continue

        print(
            f"  candidate_{key}: crop ({x0},{y0})-({x1},{y1}), "
            f"resize {UPSCALE}x ...",
            flush=True,
        )
        enlarged_width, enlarged_height = crop_and_enlarge(
            args.image, str(crop_path), x0, y0, x1, y1
        )
        if cached and not args.no_cache:
            print(f"  candidate_{key}: metadata-free crop refreshed; OCR cached", flush=True)
            continue

        print(f"  candidate_{key}: independent OCR ... ", end="", flush=True)
        response = mistral_ocr(str(crop_path), api_key)
        text = response_text(response)
        text_path.write_text(text + ("\n" if text else ""))
        results[key] = {
            "candidate": number,
            "source_bounds": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
            "source_size": {"width": x1 - x0, "height": y1 - y0},
            "enlarged_size": {"width": enlarged_width, "height": enlarged_height},
            "crop": str(crop_path),
            "ocr_text_file": str(text_path),
            "detected_numbers": number_tokens(text),
            "ocr_text": text,
        }
        with results_path.open("w") as handle:
            json.dump(results, handle, indent=2, ensure_ascii=False)
        print(f"ok ({len(text)} chars, {len(number_tokens(text))} numbers)", flush=True)
        time.sleep(0.25)

    # Ensure cached entries carry the latest file metadata and are ordered.
    ordered = {key: results[key] for key in sorted(results, key=lambda item: int(item))}
    with results_path.open("w") as handle:
        json.dump(ordered, handle, indent=2, ensure_ascii=False)
    report_path = out_dir / "candidate_ocr_report.md"
    write_report(ordered, report_path)
    archive_path = write_archive(out_dir, results_path, report_path)

    print("\nCandidate crop OCR results:", flush=True)
    for key, result in ordered.items():
        print(
            f"  candidate_{key}: {len(result['detected_numbers'])} numbers, "
            f"{len(result['ocr_text'])} OCR chars; {result['ocr_text_file']}",
            flush=True,
        )
    print(f"\nResults JSON: {results_path}", flush=True)
    print(f"Full-text report: {report_path}", flush=True)
    print(f"Archive: {archive_path}", flush=True)


if __name__ == "__main__":
    main()