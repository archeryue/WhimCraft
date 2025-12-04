# PDF Figure Extraction Service

A FastAPI microservice that extracts figures from PDF documents using PyMuPDF (fitz).

## Features

- **Automatic vector detection** using `cluster_drawings()` to find charts and diagrams
- **Caption search fallback** for documents where vector clustering doesn't work
- **High-resolution output** (3x zoom for Retina-quality images)
- Returns base64-encoded PNG images

## Installation

```bash
cd services/pdf-figures
pip install -r requirements.txt
```

## Running Locally

```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### Health Check
```
GET /health
```

### Extract Figures
```
POST /extract-figures
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- max_figures: Maximum figures to extract (default: 10)
- start_page: Starting page number, 1-indexed (optional)
- end_page: Ending page number, inclusive (optional)
```

Example response:
```json
{
  "success": true,
  "figures": [
    {
      "page": 1,
      "imageBase64": "iVBORw0KGgo...",
      "dimensions": { "width": 1200, "height": 800 },
      "bounds": { "x0": 50, "y0": 100, "x1": 450, "y1": 350 }
    }
  ]
}
```

## Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t pdf-figures .
docker run -p 8000:8000 pdf-figures
```

## Environment Variables

Set this in the main app to connect:
```
FIGURE_EXTRACT_SERVICE_URL=http://localhost:8000
```

## How It Works

1. **Strategy A: cluster_drawings()** - PyMuPDF's intelligent function that groups nearby vector instructions (lines, curves, shapes) into bounding boxes. This automatically detects charts, diagrams, and other vector graphics.

2. **Strategy B: Caption Search** - If no vector drawings are found on a page, the service searches for "Figure" or "Fig." text and captures the area above it.

Both strategies render the detected area at 3x zoom for high-quality output.
