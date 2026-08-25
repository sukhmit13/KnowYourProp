# Murrabba 39 map scan

This directory is a one-off research utility. It is not imported by, served by, or otherwise connected to the Know Your Prop application.

All generated JPEGs use metadata stripping. Derivative maps, tiles, and crops
must never retain camera model, capture timestamp, EXIF, XMP, IPTC, or Photoshop
metadata from an uploaded source image.

## Run

```sh
python3 research/cadastral_ocr/scan_murrabba_39.py \
  attached_assets/Pind_Mustafabad_Map_1787179833079.jpeg
```

The script uses the same Mistral OCR service and `mistral-ocr-latest` model as the project's scanned-recorder-document ingest. It splits the source map into overlapping tiles, makes grayscale and enhanced high-contrast copies of every tile, then OCRs both.

The default run uses 800×800 px tiles with 200 px overlap. The OCR cache in `output/tile_results.json` means a later rerun does not repeat completed OCR calls. Use `--no-cache` to force a fresh scan.

## Results from the supplied map

- Source image: 5704×3795 px
- Tiles: 60 overlapping regions, 120 OCR passes (grayscale + enhanced)
- Candidate locations: 15
- Highest-confidence candidate: **#1**, OCR text `39/`, source region **(0, 2400)–(800, 3200)**, tile 40 (column 0, row 4)

Mistral's OCR response does not include per-word confidence or word bounding boxes. The output table therefore records `not available` for per-word confidence and gives the source-image bounds of the tile containing each match. `39/` / `39//` matches are stronger murrabba notation than a plain `39` found in a sequence of neighboring numbers.

## Outputs

- `output/annotated_map.jpg` — copy of the original map, with candidate tile regions outlined and numbered
- `output/candidates.tsv` — candidate number, OCR match, confidence field, pattern, tile, source coordinates, and OCR context
- `output/tile_results.json` — OCR text for every tile/variant, also used as the resume cache
- `output/tiles/` — raw, grayscale, and enhanced tile images

## Candidate crop refinement

After the detection pass, refine all saved candidates against the original
image (not `annotated_map.jpg`):

```sh
python3 research/cadastral_ocr/refine_candidate_crops.py \
  attached_assets/Pind_Mustafabad_Map_1787179833079.jpeg
```

This writes `output/candidate_crops/candidate_01.jpg` through
`candidate_15.jpg`. Each is an exact source-coordinate crop enlarged 4×,
with no detection overlays. Every enlarged crop receives its own independent
Mistral OCR call. `results.json` stores the complete OCR text, all numeric
tokens in OCR order, source bounds, and enlarged dimensions; matching
`candidate_XX_ocr.txt` files contain the unabridged OCR text.

## Separate Murrabba 37 search

Murrabba 37 is handled as another one-off research run, isolated from the
Murrabba 39 output and entirely outside Know Your Prop:

```sh
python3 research/cadastral_ocr/scan_murrabba_39.py \
  attached_assets/Pind_Mustafabad_Map_1787179833079.jpeg \
  --target 37 \
  --out-dir research/cadastral_ocr/output/murrabba_37

python3 research/cadastral_ocr/refine_candidate_crops.py \
  attached_assets/Pind_Mustafabad_Map_1787179833079.jpeg \
  --candidates research/cadastral_ocr/output/murrabba_37/candidates.tsv \
  --out-dir research/cadastral_ocr/output/murrabba_37/candidate_crops
```

The target-specific output includes its own candidate table, annotated map,
crop images, independent OCR text, JSON results, and archive.

## Isolated page/crop enhancement

For a close-up page where labels are handwritten or partly obscured, use the
separate enhancement tool:

```sh
python3 research/cadastral_ocr/enhance_page_5309.py \
  attached_assets/IMG_5309_1787182645204.jpeg
```

It preserves the attached source, writes three 4× readability variants, and
compares independent OCR with a stricter region-by-region visual transcription.
The resulting review report keeps ambiguous marks explicitly unresolved. Do not
overlay a guessed label on a plot line; use only a manually verified reading
for any final annotation.