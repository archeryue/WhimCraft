#!/usr/bin/env python3
"""
PDF Figure Extraction Service

A FastAPI service that extracts figures from PDF documents using PyMuPDF (fitz).
Uses cluster_drawings() for automatic vector figure detection with caption search fallback.

Usage:
    pip install pymupdf fastapi uvicorn python-multipart
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import base64
from io import BytesIO
from typing import Optional

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


def extract_figures(
    pdf_bytes: bytes,
    max_figures: int = 10,
    start_page: Optional[int] = None,
    end_page: Optional[int] = None,
    zoom: float = 3.0,
    min_size: int = 100,
) -> list[Figure]:
    """
    Extract vector figures from PDF using cluster_drawings().

    Args:
        pdf_bytes: PDF file as bytes
        max_figures: Maximum figures to extract
        start_page: Starting page (1-indexed)
        end_page: Ending page (inclusive)
        zoom: Resolution multiplier (3.0 = Retina quality)
        min_size: Minimum dimension to filter out small elements

    Returns:
        List of extracted figures with base64 images
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    figures: list[Figure] = []

    # Determine page range
    first_page = (start_page or 1) - 1  # Convert to 0-indexed
    last_page = min((end_page or doc.page_count), doc.page_count)

    for page_index in range(first_page, last_page):
        if len(figures) >= max_figures:
            break

        page = doc[page_index]

        # Strategy A: Automatic Vector Detection
        # cluster_drawings() groups nearby vector lines into bounding boxes
        try:
            drawing_rects = page.cluster_drawings(tolerance=10)
        except Exception:
            # Fallback if cluster_drawings fails
            drawing_rects = []

        for rect in drawing_rects:
            if len(figures) >= max_figures:
                break

            # Filter out tiny elements (page numbers, lines, etc.)
            if rect.width < min_size or rect.height < min_size:
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

        # Strategy B: Caption Search (fallback if cluster_drawings finds nothing on this page)
        if not drawing_rects:
            for caption in ["Figure", "Fig."]:
                text_instances = page.search_for(caption)

                for inst_rect in text_instances:
                    if len(figures) >= max_figures:
                        break

                    # Figure is typically above the caption
                    figure_rect = fitz.Rect(
                        50,  # Left margin
                        max(0, inst_rect.y0 - 300),  # Above caption
                        page.rect.width - 50,  # Right margin
                        inst_rect.y0,  # Top of caption
                    )

                    # Skip if too small
                    if figure_rect.width < min_size or figure_rect.height < min_size:
                        continue

                    zoom_matrix = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=zoom_matrix, clip=figure_rect)

                    img_bytes = pix.tobytes("png")
                    img_base64 = base64.b64encode(img_bytes).decode("utf-8")

                    figures.append(Figure(
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
                        captionHint=caption,
                    ))

    doc.close()
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
