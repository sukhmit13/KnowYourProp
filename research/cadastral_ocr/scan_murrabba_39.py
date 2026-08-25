#!/usr/bin/env python3
"""
Standalone research utility: scan a cadastral map for a Murrabba number.

One-off tool — completely isolated from the Know Your Prop production app.
It reuses the project's existing OCR service (Mistral `mistral-ocr-latest`,
the same model server/recorderDocIngest.ts uses for scanned documents) but
calls it directly via HTTP so no production code is imported or modified.

Usage:
    python3 research/cadastral_ocr/scan_murrabba_39.py <image_path>
    python3 research/cadastral_ocr/scan_murrabba_39.py <image_path> --target 37 --out-dir research/cadastral_ocr/output/murrabba_37
    python3 research/cadastral_ocr/scan_murrabba_39.py <image_path> --tile-w 1200 --tile-h 1200
    python3 research/cadastral_ocr/scan_murrabba_39.py <image_path> --no-cache

Requires:
    - MISTRAL_API_KEY in the environment (already a Replit secret)
    - ImageMagick 7 (`magick`) — present in this environment

Outputs (default under research/cadastral_ocr/output/):
    annotated_map.jpg   original map with every candidate outlined + numbered
    candidates.tsv      table: number, OCR text, pattern, tile, coordinates
    tile_results.json   full per-tile OCR text + raw responses (also the resume cache)
    tiles/              raw / grayscale / high-contrast tile images
"""

import argparse
import base64
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

# ── OCR configuration (mirrors server/recorderDocIngest.ts) ──────────────────
MISTRAL_OCR_MODEL = "mistral-ocr-latest"
MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"

# ── Tile defaults (pixels at source resolution) ──────────────────────────────
DEFAULT_TILE_W = 800
DEFAULT_TILE_H = 800
DEFAULT_OVERLAP_X = 200  # so glyphs at tile edges are fully inside some tile
DEFAULT_OVERLAP_Y = 200

# ── ImageMagick args for the enhanced high-contrast variant ──────────────────
CONTRAST_ARGS = [
    "-colorspace", "Gray",
    "-auto-level",
    "-sigmoidal-contrast", "5,50%",
    "-sharpen", "0x1",
]

# ── Candidate detection ───────────────────────────────────────────────────────
# Punjab cadastral (musavi) sheets write murrabba numbers in western numerals.
# Keep the target configurable so every one-off search has an isolated output
# directory and cache. A slash suffix ("37/<killa>") is the strongest signal.
DEFAULT_TARGET = "39"


def build_candidate_patterns(target: str) -> "tuple[re.Pattern[str], re.Pattern[str]]":
    if not re.fullmatch(r"\d{2}", target):
        raise ValueError("target must be a two-digit Murrabba number")
    escaped = re.escape(target)
    general = re.compile(
        rf"""
        (?<![0-9A-Za-z])
        (?:
            {escaped}
          | {re.escape(target[0])}\.{re.escape(target[1])}
        )
        (?=[/\\\s.,;:)\]\-|]|$)
        """,
        re.VERBOSE | re.MULTILINE,
    )
    slash = re.compile(rf"{escaped}\s*/{{1,2}}")
    return general, slash


@dataclass
class TileInfo:
    index: int
    col: int
    row: int
    x0: int  # source-image pixel coordinates, top-left
    y0: int
    x1: int  # bottom-right (exclusive)
    y1: int


@dataclass
class Candidate:
    number: int
    match_text: str
    pattern: str  # "39/" | "39-general"
    confidence: str  # Mistral does not emit per-word confidence
    tile_index: int
    tile_col: int
    tile_row: int
    src_x0: int
    src_y0: int
    src_x1: int
    src_y1: int
    cx: int  # tile centre in source-image coordinates
    cy: int
    variant: str  # "gray" | "contrast"
    ocr_text_snippet: str


# ── ImageMagick helpers ───────────────────────────────────────────────────────

def run_magick(*args: str) -> None:
    r = subprocess.run(["magick", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ImageMagick failed: {r.stderr.strip()[:300]}")


def image_dimensions(path: str) -> "tuple[int, int]":
    r = subprocess.run(
        ["magick", "identify", "-format", "%wx%h", path],
        capture_output=True, text=True, check=True,
    )
    w, h = r.stdout.strip().split("x")
    return int(w), int(h)


def extract_tile(src: str, dst: str, x: int, y: int, w: int, h: int) -> None:
    run_magick(src, "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-strip", dst)


def make_gray(src: str, dst: str) -> None:
    run_magick(src, "-colorspace", "Gray", "-strip", dst)


def make_contrast(src: str, dst: str) -> None:
    run_magick(src, *CONTRAST_ARGS, "-strip", dst)


# ── Mistral OCR (same service/model as production ingest) ────────────────────

def mistral_ocr(image_path: str, api_key: str) -> dict:
    with open(image_path, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()
    ext = Path(image_path).suffix.lower().lstrip(".")
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    payload = json.dumps({
        "model": MISTRAL_OCR_MODEL,
        "document": {"type": "image_url", "image_url": f"data:{mime};base64,{b64}"},
    }).encode()
    req = urllib.request.Request(
        MISTRAL_OCR_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            last_err = RuntimeError(f"Mistral OCR HTTP {exc.code}: {body[:400]}")
            if exc.code in (429, 500, 502, 503):
                time.sleep(2 * (attempt + 1))
                continue
            raise last_err
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = RuntimeError(f"Mistral OCR network error: {exc}")
            time.sleep(2 * (attempt + 1))
    raise last_err  # type: ignore[misc]


def response_text(resp: dict) -> str:
    return "\n\n".join(p.get("markdown", "") for p in (resp.get("pages") or [])).strip()


# ── Candidate search ──────────────────────────────────────────────────────────

def search_candidates(
    text: str,
    tile: TileInfo,
    variant: str,
    murrabba_re: "re.Pattern[str]",
    slash_re: "re.Pattern[str]",
    target: str,
) -> "list[Candidate]":
    results: "list[Candidate]" = []
    spans: "list[tuple[int, int]]" = []

    def _add(m: "re.Match[str]", pattern: str) -> None:
        span = (m.start(), m.end())
        for s, e in spans:
            if span[0] < e and s < span[1]:
                return  # overlaps an already-recorded match in this tile text
        spans.append(span)
        s = max(0, m.start() - 60)
        e = min(len(text), m.end() + 60)
        snippet = text[s:e].replace("\n", " ").replace("\t", " ")
        results.append(Candidate(
            number=-1,
            match_text=m.group(0).strip(),
            pattern=pattern,
            confidence="not available",
            tile_index=tile.index,
            tile_col=tile.col,
            tile_row=tile.row,
            src_x0=tile.x0,
            src_y0=tile.y0,
            src_x1=tile.x1,
            src_y1=tile.y1,
            cx=(tile.x0 + tile.x1) // 2,
            cy=(tile.y0 + tile.y1) // 2,
            variant=variant,
            ocr_text_snippet=snippet,
        ))

    for m in slash_re.finditer(text):
        _add(m, f"{target}/")
    for m in murrabba_re.finditer(text):
        _add(m, f"{target}-general")
    return results


def spatial_dedup(candidates: "list[Candidate]", radius: int = 350) -> "list[Candidate]":
    """Merge candidates from overlapping tiles: within `radius` px of an
    already-kept candidate, drop the lower-confidence one (39/ beats
    39-general, then lower tile index)."""
    ordered = sorted(
        candidates,
        key=lambda c: (0 if c.pattern.endswith("/") else 1, c.tile_index),
    )
    kept: "list[Candidate]" = []
    for c in ordered:
        if not any(math.hypot(c.cx - k.cx, c.cy - k.cy) < radius for k in kept):
            kept.append(c)
    return kept


# ── Annotation ────────────────────────────────────────────────────────────────

COLOURS = [
    "red", "blue", "green", "darkorange", "purple", "teal",
    "crimson", "navy", "darkgreen", "maroon",
]


def annotate_image(src: str, dst: str, candidates: "list[Candidate]") -> None:
    if not candidates:
        run_magick(src, dst)
        return
    draw: "list[str]" = []
    for c in candidates:
        colour = COLOURS[(c.number - 1) % len(COLOURS)]
        draw += [
            "-fill", "none", "-stroke", colour, "-strokewidth", "6",
            "-draw", f"rectangle {c.src_x0},{c.src_y0} {c.src_x1},{c.src_y1}",
        ]
        lx, ly = c.src_x0 + 6, c.src_y0 + 6
        draw += [
            "-fill", "white", "-stroke", "none",
            "-draw", f"rectangle {lx},{ly} {lx + 84},{ly + 42}",
        ]
        draw += [
            "-fill", colour, "-font", "DejaVu-Sans-Bold", "-pointsize", "34",
            "-draw", f"text {lx + 6},{ly + 33} '#{c.number}'",
        ]
    run_magick(src, *draw, "-strip", dst)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Scan a cadastral map for a Murrabba number")
    ap.add_argument("image", help="Path to the scanned cadastral map (JPEG/PNG)")
    ap.add_argument("--out-dir", default="research/cadastral_ocr/output")
    ap.add_argument("--target", default=DEFAULT_TARGET,
                    help="Two-digit Murrabba number to search (default: 39)")
    ap.add_argument("--tile-w", type=int, default=DEFAULT_TILE_W)
    ap.add_argument("--tile-h", type=int, default=DEFAULT_TILE_H)
    ap.add_argument("--overlap-x", type=int, default=DEFAULT_OVERLAP_X)
    ap.add_argument("--overlap-y", type=int, default=DEFAULT_OVERLAP_Y)
    ap.add_argument("--no-cache", action="store_true",
                    help="Ignore cached OCR results and re-run every tile")
    ap.add_argument("--refresh-images", action="store_true",
                    help="Rebuild tile and annotated images while retaining OCR cache")
    args = ap.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY", "").strip()
    if not api_key:
        sys.exit("ERROR: MISTRAL_API_KEY environment variable is not set.")
    if not os.path.isfile(args.image):
        sys.exit(f"ERROR: image not found: {args.image}")
    try:
        murrabba_re, slash_re = build_candidate_patterns(args.target)
    except ValueError as exc:
        sys.exit(f"ERROR: {exc}")

    out_dir = Path(args.out_dir)
    tiles_dir = out_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    cache_path = out_dir / "tile_results.json"

    img_w, img_h = image_dimensions(args.image)
    print(f"Image: {args.image}  ({img_w}x{img_h} px)", flush=True)

    tw, th = args.tile_w, args.tile_h
    ox, oy = args.overlap_x, args.overlap_y
    sx, sy = tw - ox, th - oy
    if sx <= 0 or sy <= 0:
        sys.exit("ERROR: overlap must be smaller than tile size.")

    # Build the overlapping tile grid
    tiles: "list[TileInfo]" = []
    y, row = 0, 0
    while True:
        x, col = 0, 0
        y1 = min(y + th, img_h)
        while True:
            x1 = min(x + tw, img_w)
            tiles.append(TileInfo(len(tiles), col, row, x, y, x1, y1))
            if x1 >= img_w:
                break
            x += sx
            col += 1
        if y1 >= img_h:
            break
        y += sy
        row += 1

    n_cols = max(t.col for t in tiles) + 1
    n_rows = max(t.row for t in tiles) + 1
    print(f"Tiles: {len(tiles)} ({n_cols}x{n_rows} grid, {tw}x{th}px, "
          f"overlap {ox}x{oy}px) -> up to {len(tiles) * 2} OCR calls", flush=True)

    # Load OCR cache (lets an interrupted run resume without re-paying OCR)
    cache: "dict[str, dict]" = {}
    if cache_path.exists() and not args.no_cache:
        with open(cache_path) as fh:
            cache = json.load(fh)
        print(f"Loaded {len(cache)} cached tile results", flush=True)

    if args.refresh_images:
        print("Refreshing derived images with metadata stripped", flush=True)
        for tile in tiles:
            raw_path = tiles_dir / f"tile_{tile.index:04d}_raw.jpg"
            extract_tile(args.image, str(raw_path), tile.x0, tile.y0,
                         tile.x1 - tile.x0, tile.y1 - tile.y0)
            make_gray(str(raw_path), str(tiles_dir / f"tile_{tile.index:04d}_gray.jpg"))
            make_contrast(str(raw_path), str(tiles_dir / f"tile_{tile.index:04d}_contrast.jpg"))

    # ── OCR phase ──────────────────────────────────────────────────────────────
    consecutive_errors = 0
    for tile in tiles:
        for variant in ("gray", "contrast"):
            key = f"{tile.index}_{variant}"
            if key in cache and not args.no_cache:
                continue

            raw_path = tiles_dir / f"tile_{tile.index:04d}_raw.jpg"
            if not raw_path.exists():
                extract_tile(args.image, str(raw_path), tile.x0, tile.y0,
                             tile.x1 - tile.x0, tile.y1 - tile.y0)

            var_path = tiles_dir / f"tile_{tile.index:04d}_{variant}.jpg"
            if not var_path.exists():
                if variant == "gray":
                    make_gray(str(raw_path), str(var_path))
                else:
                    make_contrast(str(raw_path), str(var_path))

            print(f"  OCR tile {tile.index + 1:3d}/{len(tiles)} [{variant:8s}] ... ",
                  end="", flush=True)
            try:
                resp = mistral_ocr(str(var_path), api_key)
                text = response_text(resp)
                cache[key] = {"text": text}
                consecutive_errors = 0
                print(f"ok ({len(text)} chars)")
            except Exception as exc:
                consecutive_errors += 1
                cache[key] = {"text": "", "error": str(exc)}
                print(f"ERROR: {exc}")
                if consecutive_errors >= 5:
                    with open(cache_path, "w") as fh:
                        json.dump(cache, fh, indent=2)
                    sys.exit("ERROR: 5 consecutive OCR failures — aborting instead of "
                             "burning quota. Check MISTRAL_API_KEY / connectivity, then "
                             "re-run (cached tiles are kept).")

            with open(cache_path, "w") as fh:
                json.dump(cache, fh, indent=2)
            time.sleep(0.25)  # polite pacing

    # ── Search phase ───────────────────────────────────────────────────────────
    raw_candidates: "list[Candidate]" = []
    for tile in tiles:
        for variant in ("gray", "contrast"):
            text = cache.get(f"{tile.index}_{variant}", {}).get("text", "")
            if text:
                raw_candidates.extend(search_candidates(
                    text, tile, variant, murrabba_re, slash_re, args.target
                ))

    # De-duplicate identical matches found in both variants of the same tile
    seen: "set[tuple]" = set()
    unique: "list[Candidate]" = []
    for c in sorted(
        raw_candidates,
        key=lambda c: (0 if c.pattern.endswith("/") else 1, c.tile_index),
    ):
        sig = (c.tile_index, c.match_text)
        if sig not in seen:
            seen.add(sig)
            unique.append(c)

    final = spatial_dedup(unique)
    for i, c in enumerate(final, 1):
        c.number = i

    # ── Annotated map ──────────────────────────────────────────────────────────
    annotated_path = out_dir / "annotated_map.jpg"
    print(f"\nWriting annotated map -> {annotated_path}", flush=True)
    annotate_image(args.image, str(annotated_path), final)

    # ── Candidate table ────────────────────────────────────────────────────────
    tsv_path = out_dir / "candidates.tsv"
    with open(tsv_path, "w") as fh:
        cols = ["#", "match_text", "confidence", "pattern", "tile_index", "tile_col", "tile_row",
                "src_x0", "src_y0", "src_x1", "src_y1", "cx", "cy",
                "variant", "ocr_text_snippet"]
        fh.write("\t".join(cols) + "\n")
        for c in final:
            fh.write("\t".join([
                str(c.number), c.match_text, c.confidence, c.pattern,
                str(c.tile_index), str(c.tile_col), str(c.tile_row),
                str(c.src_x0), str(c.src_y0), str(c.src_x1), str(c.src_y1),
                str(c.cx), str(c.cy), c.variant,
                c.ocr_text_snippet.rstrip(),
            ]) + "\n")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("\n" + "-" * 72)
    if final:
        print(f"{len(final)} candidate location(s) for Murrabba {args.target}:\n")
        for c in final:
            region = f"({c.src_x0},{c.src_y0})-({c.src_x1},{c.src_y1})"
            print(f"  #{c.number:2d}  match={c.match_text!r:<8} pattern={c.pattern:<11} "
                  f"tile={c.tile_index:3d} ({c.tile_col},{c.tile_row})  src {region}")
            print(f"       context: ...{c.ocr_text_snippet}...")
    else:
        print(f"No candidates matching Murrabba {args.target} patterns were found.")
        print("Suggestions:")
        print("  - Re-run with --tile-w 1200 --tile-h 1200 (bigger context per tile)")
        print("  - Inspect tile_results.json (the map may be numbered in Urdu script)")

    print(f"\nOutputs:")
    print(f"  annotated map : {annotated_path}")
    print(f"  table (TSV)   : {tsv_path}")
    print(f"  OCR cache     : {cache_path}")
    print(f"  tiles         : {tiles_dir}")

    # Note: Mistral OCR does not return per-word confidence scores, so the
    # requested confidence column is expressed via the `pattern` column
    # ("<target>/" = murrabba notation, highest confidence; "<target>-general"
    # = plain match).


if __name__ == "__main__":
    main()
