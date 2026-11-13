"""File storage behind a small interface.

Development uses the local disk. Swapping in S3 / GCS later means writing
one more class with the same four methods; nothing else changes.
"""

from __future__ import annotations

import io
import shutil
from pathlib import Path

from PIL import Image

from ..core.errors import InvalidInput, NotFound

Image.MAX_IMAGE_PIXELS = 40_000_000  # refuse decompression bombs


class LocalStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _safe(self, rel: str) -> Path:
        path = (self.root / rel).resolve()
        if self.root not in path.parents and path != self.root:
            raise InvalidInput("invalid storage path")
        return path

    def save_png(self, rel: str, image: Image.Image) -> str:
        path = self._safe(rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, format="PNG", optimize=True)
        return rel

    def path(self, rel: str) -> Path:
        path = self._safe(rel)
        if not path.exists():
            raise NotFound("file not found")
        return path

    def load_rgb(self, rel: str) -> Image.Image:
        with Image.open(self.path(rel)) as im:
            return im.convert("RGB")

    def delete_tree(self, rel: str) -> None:
        shutil.rmtree(self._safe(rel), ignore_errors=True)


def decode_image(data: bytes, max_bytes: int) -> Image.Image:
    """Validate and decode an uploaded image (size, format, integrity)."""
    from ..core.errors import PayloadTooLarge

    if len(data) > max_bytes:
        raise PayloadTooLarge(f"image larger than {max_bytes // (1024 * 1024)} MB")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as im:
            if im.format not in {"PNG", "JPEG", "WEBP", "BMP"}:
                raise InvalidInput(f"unsupported image format {im.format}")
            return im.convert("RGB")
    except InvalidInput:
        raise
    except Exception as exc:  # PIL raises many types for corrupt files
        raise InvalidInput("file is not a readable image") from exc
