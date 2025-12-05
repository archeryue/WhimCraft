#!/usr/bin/env python3
"""
PDF Figure Extraction Service

A FastAPI service that extracts figures from PDF documents using PyMuPDF (fitz).
Uses cluster_drawings() for automatic vector figure detection with caption search fallback.
Optionally uses LLM vision to verify extracted regions are actual figures.

Usage:
    pip install pymupdf fastapi uvicorn python-multipart google-generativeai
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import base64
import os
from io import BytesIO
from typing import Optional

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Optional: Google Generative AI for LLM verification
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None

app = FastAPI(
    title="PDF Figure Extraction Service",
    description="Extract figures from PDF documents using PyMuPDF",
    version="1.0.0",
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Figure(BaseModel):
    """Extracted figure data"""
    page: int
    imageBase64: str
    dimensions: dict
    bounds: Optional[dict] = None
    captionHint: Optional[str] = None


class ExtractionResponse(BaseModel):
    """Response from figure extraction"""
    success: bool
    figures: list[Figure]
    error: Optional[str] = None


def get_gemini_model():
    """Get Gemini model for vision verification."""
    if not GEMINI_AVAILABLE:
        return None

    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        genai.configure(api_key=api_key)
        return genai.GenerativeModel("gemini-2.0-flash-lite")
    except Exception as e:
        print(f"[LLM Verify] Failed to initialize Gemini: {e}")
        return None


def verify_figure_with_llm(image_base64: str, model) -> dict:
    """
    Use Gemini vision to verify if an image is a real figure.

    Returns:
        dict with 'is_figure' (bool) and 'figure_type' (str)
    """
    if model is None:
        return {"is_figure": True, "figure_type": "unknown", "skipped": True}

    try:
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)

        prompt = """Analyze this image extracted from a PDF document.

Is this a FIGURE (chart, diagram, graph, illustration, photo, table with visual elements)?
Or is this just TEXT (paragraphs, code blocks, or text-heavy content without visual elements)?

Respond in this exact format:
TYPE: [FIGURE or TEXT]
CATEGORY: [one of: chart, diagram, graph, table, illustration, photo, code, text_block, mixed]
CONFIDENCE: [HIGH, MEDIUM, or LOW]

Be strict: if more than 60% of the image is regular text paragraphs, classify as TEXT."""

        response = model.generate_content([
            {"mime_type": "image/png", "data": image_bytes},
            prompt
        ])

        result_text = response.text.strip().upper()

        is_figure = "TYPE: FIGURE" in result_text or "TYPE:FIGURE" in result_text

        # Extract category
        category = "unknown"
        for cat in ["CHART", "DIAGRAM", "GRAPH", "TABLE", "ILLUSTRATION", "PHOTO", "CODE", "TEXT_BLOCK", "MIXED"]:
            if cat in result_text:
                category = cat.lower()
                break

        return {
            "is_figure": is_figure,
            "figure_type": category,
            "raw_response": response.text[:200]
        }
    except Exception as e:
        print(f"[LLM Verify] Error: {e}")
        return {"is_figure": True, "figure_type": "unknown", "error": str(e)}


def is_likely_text_block(page, rect, text_coverage_threshold: float = 0.6) -> bool:
    """
    Check if a region is likely a text block rather than a figure.

    Text blocks have high text coverage relative to their area.
    Figures typically have low text coverage (mostly graphics).
    """
    # Get text in the region
    text = page.get_text("text", clip=rect).strip()
    if not text:
        return False  # No text = likely a figure

    # Calculate text density
    # Approximate: each character takes ~10x10 pixels at normal size
    char_count = len(text.replace("\n", "").replace(" ", ""))
    estimated_text_area = char_count * 50  # rough estimate
    rect_area = rect.width * rect.height

    if rect_area == 0:
        return True

    text_coverage = estimated_text_area / rect_area

    # If text covers more than threshold of the area, it's likely a text block
    return text_coverage > text_coverage_threshold


def has_good_aspect_ratio(rect, min_ratio: float = 0.3, max_ratio: float = 3.0) -> bool:
    """
    Check if the rectangle has a reasonable aspect ratio for a figure.

    Very tall/narrow or very wide/short rectangles are often text columns.
    Figures tend to have more balanced aspect ratios.
    """
    if rect.height == 0 or rect.width == 0:
        return False

    ratio = rect.width / rect.height
    return min_ratio <= ratio <= max_ratio


def get_drawing_density(page, rect) -> float:
    """
    Calculate the density of vector drawings in a region.

    High density = likely a figure with lines, shapes, etc.
    Low density = likely text or whitespace.
    """
    drawings = page.get_drawings()
    if not drawings:
        return 0.0

    # Count drawings that intersect with the rect
    intersecting_drawings = 0
    for d in drawings:
        draw_rect = fitz.Rect(d["rect"])
        if rect.intersects(draw_rect):
            intersecting_drawings += 1

    # Normalize by area (drawings per 10000 square points)
    area = rect.width * rect.height
    if area == 0:
        return 0.0

    return (intersecting_drawings / area) * 10000


def extract_embedded_images(
    doc: fitz.Document,
    page_index: int,
    min_size: int = 150,
) -> list[Figure]:
    """
    Extract embedded raster images (png/jpg) from a page.

    These are complete images embedded in the PDF, not rendered from vectors.
    They should be extracted directly without cropping.
    """
    figures = []
    page = doc[page_index]

    # Get all images on this page
    images = page.get_images(full=True)

    for img_info in images:
        xref = img_info[0]  # xref is the image reference number

        try:
            # Extract the actual image data
            base_image = doc.extract_image(xref)

            width = base_image["width"]
            height = base_image["height"]
            img_ext = base_image["ext"]  # png, jpeg, etc.
            img_data = base_image["image"]

            # Filter out small images (icons, bullets, etc.)
            if width < min_size or height < min_size:
                continue

            # Filter out very small aspect ratio images (likely decorative)
            aspect = width / height if height > 0 else 0
            if aspect < 0.2 or aspect > 5:
                continue

            # Convert to PNG if needed, otherwise use as-is
            if img_ext.lower() in ("png", "jpeg", "jpg"):
                img_base64 = base64.b64encode(img_data).decode("utf-8")
            else:
                # Convert other formats to PNG using pixmap
                pix = fitz.Pixmap(img_data)
                img_base64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")

            figures.append(Figure(
                page=page_index + 1,
                imageBase64=img_base64,
                dimensions={"width": width, "height": height},
                bounds=None,  # Embedded images don't have page bounds
                captionHint=f"embedded_{img_ext}",
            ))

        except Exception as e:
            # Skip images that can't be extracted
            print(f"[Extract] Failed to extract image xref={xref}: {e}")
            continue

    return figures


def extract_figures(
    pdf_bytes: bytes,
    max_figures: int = 10,
    start_page: Optional[int] = None,
    end_page: Optional[int] = None,
    zoom: float = 3.0,
    min_size: int = 150,  # Increased from 100
    verify_with_llm: bool = False,
) -> list[Figure]:
    """
    Extract figures from PDF using multiple strategies:
    1. Embedded images (png/jpg) - highest priority, already complete
    2. Vector drawings (cluster_drawings) - for charts/diagrams drawn with vectors
    3. Caption-based detection - fallback for figures not detected above

    Args:
        pdf_bytes: PDF file as bytes
        max_figures: Maximum figures to extract
        start_page: Starting page (1-indexed)
        end_page: Ending page (inclusive)
        zoom: Resolution multiplier (3.0 = Retina quality)
        min_size: Minimum dimension to filter out small elements
        verify_with_llm: Use Gemini vision to verify figures (requires API key)

    Returns:
        List of extracted figures with base64 images
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    figures: list[Figure] = []

    # Initialize LLM model if verification is enabled
    llm_model = get_gemini_model() if verify_with_llm else None
    if verify_with_llm and llm_model is None:
        print("[LLM Verify] Warning: LLM verification requested but Gemini not available")

    # Determine page range
    first_page = (start_page or 1) - 1  # Convert to 0-indexed
    last_page = min((end_page or doc.page_count), doc.page_count)

    for page_index in range(first_page, last_page):
        if len(figures) >= max_figures:
            break

        page = doc[page_index]

        # Strategy A: Extract embedded images (png/jpg) - HIGHEST PRIORITY
        # These are complete figures already embedded in the PDF
        embedded_figs = extract_embedded_images(doc, page_index, min_size)
        for fig in embedded_figs:
            if len(figures) >= max_figures:
                break
            figures.append(fig)

        # Strategy B: Automatic Vector Detection
        # cluster_drawings() groups nearby vector lines into bounding boxes
        try:
            drawing_rects = page.cluster_drawings(tolerance=10)
        except Exception:
            # Fallback if cluster_drawings fails
            drawing_rects = []

        for rect in drawing_rects:
            if len(figures) >= max_figures:
                break

            # Filter 1: Minimum size
            if rect.width < min_size or rect.height < min_size:
                continue

            # Filter 2: Aspect ratio (filter out text columns)
            if not has_good_aspect_ratio(rect, min_ratio=0.4, max_ratio=2.5):
                continue

            # Filter 3: Text coverage (filter out text blocks)
            if is_likely_text_block(page, rect, text_coverage_threshold=0.4):
                continue

            # Filter 4: Drawing density (prefer regions with actual drawings)
            density = get_drawing_density(page, rect)
            if density < 0.5:  # Very few drawings = probably not a figure
                continue

            # High-resolution render (zoom = 3x for crisp output)
            zoom_matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=zoom_matrix, clip=rect)

            # Convert to base64
            img_bytes = pix.tobytes("png")
            img_base64 = base64.b64encode(img_bytes).decode("utf-8")

            figures.append(Figure(
                page=page_index + 1,
                imageBase64=img_base64,
                dimensions={
                    "width": int(rect.width * zoom),
                    "height": int(rect.height * zoom),
                },
                bounds={
                    "x0": rect.x0,
                    "y0": rect.y0,
                    "x1": rect.x1,
                    "y1": rect.y1,
                },
            ))

        # Strategy C: Caption-based detection (fallback)
        # Skip if we already found embedded images on this page
        # (embedded images are higher quality than caption-based extraction)
        if embedded_figs:
            continue

        # Look for "Figure X" or "Fig. X" captions and extract the region above
        page_figures_from_captions = []
        for caption_pattern in ["Figure ", "Fig. "]:
            text_instances = page.search_for(caption_pattern)

            for inst_rect in text_instances:
                if len(figures) + len(page_figures_from_captions) >= max_figures:
                    break

                # Get the full caption text to find the figure number
                caption_area = fitz.Rect(
                    inst_rect.x0 - 5,
                    inst_rect.y0 - 2,
                    min(inst_rect.x0 + 150, page.rect.width),
                    inst_rect.y1 + 2,
                )
                caption_text = page.get_text("text", clip=caption_area).strip()

                # Figure is typically above the caption
                # Use page width but constrain height
                figure_rect = fitz.Rect(
                    30,  # Left margin
                    max(0, inst_rect.y0 - 250),  # Above caption (reduced from 300)
                    page.rect.width - 30,  # Right margin
                    inst_rect.y0 - 5,  # Just above caption
                )

                # Skip if too small
                if figure_rect.width < min_size or figure_rect.height < 80:
                    continue

                # Skip if this region is mostly text
                if is_likely_text_block(page, figure_rect, text_coverage_threshold=0.5):
                    continue

                zoom_matrix = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=zoom_matrix, clip=figure_rect)

                img_bytes = pix.tobytes("png")
                img_base64 = base64.b64encode(img_bytes).decode("utf-8")

                page_figures_from_captions.append(Figure(
                    page=page_index + 1,
                    imageBase64=img_base64,
                    dimensions={
                        "width": int(figure_rect.width * zoom),
                        "height": int(figure_rect.height * zoom),
                    },
                    bounds={
                        "x0": figure_rect.x0,
                        "y0": figure_rect.y0,
                        "x1": figure_rect.x1,
                        "y1": figure_rect.y1,
                    },
                    captionHint=caption_text[:50] if caption_text else caption_pattern,
                ))

        # Add caption-based figures if we didn't find enough with vector detection
        if len(figures) < max_figures:
            figures.extend(page_figures_from_captions[:max_figures - len(figures)])

    doc.close()

    # LLM verification pass - filter out non-figures
    if verify_with_llm and llm_model is not None and figures:
        print(f"[LLM Verify] Verifying {len(figures)} candidate figures...")
        verified_figures = []

        for i, fig in enumerate(figures):
            result = verify_figure_with_llm(fig.imageBase64, llm_model)
            print(f"[LLM Verify] Figure {i+1}: {result.get('figure_type', 'unknown')} - {'KEEP' if result['is_figure'] else 'REJECT'}")

            if result["is_figure"]:
                # Add figure type info to caption hint
                if result.get("figure_type") and result["figure_type"] != "unknown":
                    fig.captionHint = f"{result['figure_type']}: {fig.captionHint or ''}"
                verified_figures.append(fig)

        print(f"[LLM Verify] Kept {len(verified_figures)}/{len(figures)} figures")
        figures = verified_figures

    return figures


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "pdf-figure-extraction"}


@app.post("/extract-figures", response_model=ExtractionResponse)
async def extract_figures_endpoint(
    file: UploadFile = File(...),
    max_figures: int = Form(default=10),
    start_page: Optional[int] = Form(default=None),
    end_page: Optional[int] = Form(default=None),
    verify_with_llm: bool = Form(default=False),
):
    """
    Extract figures from a PDF document.

    Args:
        file: PDF file to process
        max_figures: Maximum number of figures to extract (default: 10)
        start_page: Starting page number (1-indexed, optional)
        end_page: Ending page number (inclusive, optional)

    Returns:
        ExtractionResponse with list of extracted figures
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        if file.content_type != "application/pdf":
            raise HTTPException(
                status_code=400,
                detail="File must be a PDF document",
            )

    try:
        # Read PDF bytes
        pdf_bytes = await file.read()

        # Validate PDF magic bytes
        if not pdf_bytes.startswith(b"%PDF"):
            raise HTTPException(
                status_code=400,
                detail="Invalid PDF file: missing PDF header",
            )

        # Extract figures
        figures = extract_figures(
            pdf_bytes=pdf_bytes,
            max_figures=max_figures,
            start_page=start_page,
            end_page=end_page,
            verify_with_llm=verify_with_llm,
        )

        return ExtractionResponse(
            success=True,
            figures=figures,
        )

    except HTTPException:
        raise
    except Exception as e:
        return ExtractionResponse(
            success=False,
            figures=[],
            error=str(e),
        )


def cli_mode():
    """
    CLI mode: Read PDF from stdin, output JSON to stdout.

    Usage:
        cat document.pdf | python3 main.py --cli --max-figures 10
        cat document.pdf | python3 main.py --cli --start-page 1 --end-page 5
    """
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="Extract figures from PDF")
    parser.add_argument("--cli", action="store_true", help="Run in CLI mode (stdin/stdout)")
    parser.add_argument("--max-figures", type=int, default=10, help="Max figures to extract")
    parser.add_argument("--start-page", type=int, default=None, help="Starting page (1-indexed)")
    parser.add_argument("--end-page", type=int, default=None, help="Ending page (inclusive)")
    parser.add_argument("--verify-with-llm", action="store_true", help="Use LLM to verify figures")

    args = parser.parse_args()

    if not args.cli:
        # Run HTTP server
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
        return

    try:
        # Read PDF from stdin
        pdf_bytes = sys.stdin.buffer.read()

        if not pdf_bytes:
            result = {"success": False, "figures": [], "error": "No PDF data received on stdin"}
            print(json.dumps(result))
            sys.exit(1)

        if not pdf_bytes.startswith(b"%PDF"):
            result = {"success": False, "figures": [], "error": "Invalid PDF: missing PDF header"}
            print(json.dumps(result))
            sys.exit(1)

        # Extract figures
        figures = extract_figures(
            pdf_bytes=pdf_bytes,
            max_figures=args.max_figures,
            start_page=args.start_page,
            end_page=args.end_page,
            verify_with_llm=args.verify_with_llm,
        )

        # Output JSON (same format as HTTP API)
        result = {
            "success": True,
            "figures": [
                {
                    "page": fig.page,
                    "imageBase64": fig.imageBase64,
                    "dimensions": fig.dimensions,
                    "bounds": fig.bounds,
                    "captionHint": fig.captionHint,
                }
                for fig in figures
            ],
        }
        print(json.dumps(result))

    except Exception as e:
        result = {"success": False, "figures": [], "error": str(e)}
        print(json.dumps(result))
        sys.exit(1)


if __name__ == "__main__":
    import sys
    if "--cli" in sys.argv:
        cli_mode()
    else:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
