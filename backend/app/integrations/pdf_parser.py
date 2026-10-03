import asyncio
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

# Fewer characters than this almost always means a scanned or image-only PDF.
MIN_TEXT_CHARS = 100
MAX_PAGES = 20


class PdfParseError(Exception):
    pass


def _extract(data: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise PdfParseError("Password-protected PDFs aren't supported")
        pages = reader.pages[:MAX_PAGES]
        text = "\n".join(page.extract_text() or "" for page in pages)
    except PdfParseError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise PdfParseError("This file couldn't be read as a PDF") from exc

    # Collapse layout whitespace but keep line breaks, which separate sections.
    lines = (" ".join(line.split()) for line in text.splitlines())
    text = "\n".join(line for line in lines if line)
    if len(text) < MIN_TEXT_CHARS:
        raise PdfParseError(
            "No readable text found. Scanned or image-only PDFs aren't supported yet"
        )
    return text


async def extract_text(data: bytes) -> str:
    """Extract plain text from a PDF. Parsing is CPU-bound, so it runs in a thread."""
    return await asyncio.to_thread(_extract, data)
