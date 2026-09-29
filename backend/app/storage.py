from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import settings

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB — PRD §10 asks for a sane per-upload cap


class UploadTooLarge(Exception):
    pass


# STORAGE_PROVIDER abstraction (PRD §8). Only "local-disk" is wired for now;
# swap to "s3" later behind this same function signature.
def save_upload(file: UploadFile, subdir: str) -> tuple[str, str]:
    if settings.storage_provider != "local-disk":
        raise NotImplementedError(f"STORAGE_PROVIDER={settings.storage_provider} not wired yet")

    data = file.file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadTooLarge()

    base = Path(settings.storage_local_dir) / subdir
    base.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix
    name = f"{uuid4()}{ext}"
    dest = base / name
    dest.write_bytes(data)

    return f"/uploads/{subdir}/{name}", file.content_type or "application/octet-stream"
