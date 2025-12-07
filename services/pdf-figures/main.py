#!/usr/bin/env python3
"""
PDF Figure Extraction CLI Tool

Extracts figures from PDF documents using PyMuPDF (fitz).
Uses cluster_drawings() for automatic vector figure detection with caption search fallback.

Usage:
    cat document.pdf | python3 main.py --cli --max-figures 10
    cat document.pdf | python3 main.py --cli --start-page 1 --end-page 5

Dependencies:
    pip install pymupdf
"""

import argparse
import base64
import json
import os
import sys
from typing import Optional

import fitz  # PyMuPDF


def is_likely_text_block(page, rect, text_coverage_threshold: float = 0.6) -> bool:
    """
    Check if a region is likely a text block rather than a figure.
    """
    text = page.get_text("text", clip=rect).strip()
    if not text:
        return False

    char_count = len(text.replace("\n", "").replace(" ", ""))
    estimated_text_area = char_count * 50
    rect_area = rect.width * rect.height

    if rect_area == 0:
        return True

    text_coverage = estimated_text_area / rect_area
    return text_coverage > text_coverage_threshold


def has_good_aspect_ratio(rect, min_ratio: float = 0.3, max_ratio: float = 3.0) -> bool:
    """
    Check if the rectangle has a reasonable aspect ratio for a figure.
    """
    if rect.height == 0 or rect.width == 0:
        return False

    ratio = rect.width / rect.height
    return min_ratio <= ratio <= max_ratio


def get_drawing_density(page, rect) -> float:
    """
    Calculate the density of vector drawings in a region.
    """
    drawings = page.get_drawings()
    if not drawings:
        return 0.0

    intersecting_drawings = 0
    for d in drawings:
        draw_rect = fitz.Rect(d["rect"])
        if rect.intersects(draw_rect):
            intersecting_drawings += 1

    area = rect.width * rect.height
    if area == 0:
        return 0.0

    return (intersecting_drawings / area) * 10000


def extract_embedded_images(doc, page_index: int, min_size: int = 150) -> list:
    """
    Extract embedded raster images (png/jpg) from a page.
    """
    figures = []
    page = doc[page_index]
    images = page.get_images(full=True)

    for img_info in images:
        xref = img_info[0]

        try:
            base_image = doc.extract_image(xref)
            width = base_image["width"]
            height = base_image["height"]
            img_ext = base_image["ext"]
            img_data = base_image["image"]

            if width < min_size or height < min_size:
                continue

            aspect = width / height if height > 0 else 0
            if aspect < 0.2 or aspect > 5:
                continue

            if img_ext.lower() in ("png", "jpeg", "jpg"):
                img_base64 = base64.b64encode(img_data).decode("utf-8")
            else:
                pix = fitz.Pixmap(img_data)
                img_base64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")

            figures.append({
                "page": page_index + 1,
                "imageBase64": img_base64,
                "dimensions": {"width": width, "height": height},
                "bounds": None,
                "captionHint": f"embedded_{img_ext}",
            })

        except Exception as e:
            print(f"[Extract] Failed to extract image xref={xref}: {e}", file=sys.stderr)
            continue

    return figures


def extract_figures(
    pdf_bytes: bytes,
    max_figures: int = 10,
    start_page: Optional[int] = None,
    end_page: Optional[int] = None,
    zoom: float = 3.0,
    min_size: int = 150,
) -> list:
    """
    Extract figures from PDF using multiple strategies:
    1. Embedded images (png/jpg) - highest priority
    2. Vector drawings (cluster_drawings) - for charts/diagrams
    3. Caption-based detection - fallback
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    figures = []

    first_page = (start_page or 1) - 1
    last_page = min((end_page or doc.page_count), doc.page_count)

    for page_index in range(first_page, last_page):
        if len(figures) >= max_figures:
            break

        page = doc[page_index]

        # Strategy A: Extract embedded images
        embedded_figs = extract_embedded_images(doc, page_index, min_size)
        for fig in embedded_figs:
            if len(figures) >= max_figures:
                break
            figures.append(fig)

        # Strategy B: Vector detection via cluster_drawings
        try:
            drawing_rects = page.cluster_drawings(tolerance=10)
        except Exception:
            drawing_rects = []

        for rect in drawing_rects:
            if len(figures) >= max_figures:
                break

            if rect.width < min_size or rect.height < min_size:
                continue

            if not has_good_aspect_ratio(rect, min_ratio=0.4, max_ratio=2.5):
                continue

            if is_likely_text_block(page, rect, text_coverage_threshold=0.4):
                continue

            density = get_drawing_density(page, rect)
            if density < 0.5:
                continue

            zoom_matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=zoom_matrix, clip=rect)
            img_bytes = pix.tobytes("png")
            img_base64 = base64.b64encode(img_bytes).decode("utf-8")

            figures.append({
                "page": page_index + 1,
                "imageBase64": img_base64,
                "dimensions": {
                    "width": int(rect.width * zoom),
                    "height": int(rect.height * zoom),
                },
                "bounds": {
                    "x0": rect.x0,
                    "y0": rect.y0,
                    "x1": rect.x1,
                    "y1": rect.y1,
                },
                "captionHint": None,
            })

        # Strategy C: Caption-based detection (fallback)
        if embedded_figs:
            continue

        page_figures_from_captions = []
        for caption_pattern in ["Figure ", "Fig. "]:
            text_instances = page.search_for(caption_pattern)

            for inst_rect in text_instances:
                if len(figures) + len(page_figures_from_captions) >= max_figures:
                    break

                caption_area = fitz.Rect(
                    inst_rect.x0 - 5,
                    inst_rect.y0 - 2,
                    min(inst_rect.x0 + 150, page.rect.width),
                    inst_rect.y1 + 2,
                )
                caption_text = page.get_text("text", clip=caption_area).strip()

                figure_rect = fitz.Rect(
                    30,
                    max(0, inst_rect.y0 - 250),
                    page.rect.width - 30,
                    inst_rect.y0 - 5,
                )

                if figure_rect.width < min_size or figure_rect.height < 80:
                    continue

                if is_likely_text_block(page, figure_rect, text_coverage_threshold=0.5):
                    continue

                zoom_matrix = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=zoom_matrix, clip=figure_rect)
                img_bytes = pix.tobytes("png")
                img_base64 = base64.b64encode(img_bytes).decode("utf-8")

                page_figures_from_captions.append({
                    "page": page_index + 1,
                    "imageBase64": img_base64,
                    "dimensions": {
                        "width": int(figure_rect.width * zoom),
                        "height": int(figure_rect.height * zoom),
                    },
                    "bounds": {
                        "x0": figure_rect.x0,
                        "y0": figure_rect.y0,
                        "x1": figure_rect.x1,
                        "y1": figure_rect.y1,
                    },
                    "captionHint": caption_text[:50] if caption_text else caption_pattern,
                })

        if len(figures) < max_figures:
            figures.extend(page_figures_from_captions[:max_figures - len(figures)])

    doc.close()
    return figures


def main():
    """
    CLI mode: Read PDF from stdin, output JSON to stdout.
    """
    parser = argparse.ArgumentParser(description="Extract figures from PDF")
    parser.add_argument("--cli", action="store_true", help="Run in CLI mode (required)")
    parser.add_argument("--max-figures", type=int, default=10, help="Max figures to extract")
    parser.add_argument("--start-page", type=int, default=None, help="Starting page (1-indexed)")
    parser.add_argument("--end-page", type=int, default=None, help="Ending page (inclusive)")

    args = parser.parse_args()

    if not args.cli:
        print("Error: --cli flag is required", file=sys.stderr)
        sys.exit(1)

    try:
        pdf_bytes = sys.stdin.buffer.read()

        if not pdf_bytes:
            result = {"success": False, "figures": [], "error": "No PDF data received on stdin"}
            print(json.dumps(result))
            sys.exit(1)

        if not pdf_bytes.startswith(b"%PDF"):
            result = {"success": False, "figures": [], "error": "Invalid PDF: missing PDF header"}
            print(json.dumps(result))
            sys.exit(1)

        figures = extract_figures(
            pdf_bytes=pdf_bytes,
            max_figures=args.max_figures,
            start_page=args.start_page,
            end_page=args.end_page,
        )

        result = {"success": True, "figures": figures}
        print(json.dumps(result))

    except Exception as e:
        result = {"success": False, "figures": [], "error": str(e)}
        print(json.dumps(result))
        sys.exit(1)


if __name__ == "__main__":
    main()
