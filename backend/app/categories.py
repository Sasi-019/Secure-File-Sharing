"""
Sort files into the folders shown in the library (Images, Videos, ...).

Pure functions with no database access. The category is worked out from the
file's extension first (more reliable than the browser's guess) and then from
its content type, so it never needs to be stored.
"""
from pathlib import Path

CATEGORIES = ("images", "videos", "audio", "pdfs", "documents", "archives", "other")

VISIBILITIES = ("private", "public", "shared")

_BY_EXTENSION = {
    "images": {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
        ".heic", ".heif", ".tif", ".tiff", ".avif", ".ico",
    },
    "videos": {
        ".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm",
        ".m4v", ".mpg", ".mpeg", ".3gp",
    },
    "audio": {
        ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus",
    },
    "pdfs": {".pdf"},
    "documents": {
        ".doc", ".docx", ".odt", ".rtf", ".txt", ".md",
        ".xls", ".xlsx", ".ods", ".csv",
        ".ppt", ".pptx", ".odp",
    },
    "archives": {".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2"},
}

_DOCUMENT_TYPES = (
    "msword",
    "officedocument",
    "opendocument",
    "text/plain",
    "text/csv",
    "text/markdown",
    "rtf",
)


def file_category(filename: str | None, content_type: str | None) -> str:
    """One of CATEGORIES."""
    extension = Path(filename or "").suffix.lower()

    for category, extensions in _BY_EXTENSION.items():
        if extension in extensions:
            return category

    kind = (content_type or "").lower()

    if kind.startswith("image/"):
        return "images"

    if kind.startswith("video/"):
        return "videos"

    if kind.startswith("audio/"):
        return "audio"

    if kind == "application/pdf":
        return "pdfs"

    if any(part in kind for part in _DOCUMENT_TYPES):
        return "documents"

    if "zip" in kind or "compressed" in kind or "tar" in kind:
        return "archives"

    return "other"
