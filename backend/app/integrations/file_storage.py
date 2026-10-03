import asyncio
import uuid
from pathlib import Path


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


async def save_resume(base_dir: Path, user_id: uuid.UUID, data: bytes) -> str:
    """Store the PDF under <base_dir>/<user_id>/<uuid>.pdf and return the relative path.
    The name is generated, so nothing from the user's filename reaches the filesystem."""
    relative = Path(str(user_id)) / f"{uuid.uuid4()}.pdf"
    await asyncio.to_thread(_write, base_dir / relative, data)
    return relative.as_posix()


def _remove(path: Path) -> None:
    path.unlink(missing_ok=True)
    # Drop the user's folder once it's empty.
    try:
        path.parent.rmdir()
    except OSError:
        pass


async def delete_resume(base_dir: Path, relative_path: str) -> None:
    """Delete a stored resume. Refuses any path that would land outside `base_dir`."""
    base = base_dir.resolve()
    path = (base / relative_path).resolve()
    if path == base or not path.is_relative_to(base):
        raise ValueError(f"Refusing to delete outside the upload directory: {relative_path}")
    await asyncio.to_thread(_remove, path)
