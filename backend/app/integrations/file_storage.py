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
