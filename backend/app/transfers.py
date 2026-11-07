"""
Recording and measuring uploads and downloads.

Downloads are streamed through this backend (instead of sending the browser
straight to Backblaze) so the server can see how many bytes moved and how
long it took. That is what makes real download speed and duration graphs
possible. Nothing here invents data: a speed or duration is only stored when
it was actually measured.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from botocore.exceptions import ClientError

from app.database import SessionLocal
from app.models import Movie, TransferEvent, User
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY

logger = logging.getLogger(__name__)

# How long a download link (ticket) can be used to start downloads.
DOWNLOAD_TICKET_SECONDS = 600

# Size of each piece read from storage and sent to the browser.
STREAM_CHUNK_BYTES = 256 * 1024

# Upload timings reported by the browser are only trusted inside this range.
MIN_CLIENT_DURATION_MS = 1
MAX_CLIENT_DURATION_MS = 6 * 60 * 60 * 1000

NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


# --------------------------------------------------
# Recording events
# --------------------------------------------------

def record_event(
    *,
    kind: str,
    user_id: int | None,
    user_name: str | None,
    movie_id: int | None,
    movie_title: str | None,
    bytes_transferred: int,
    total_bytes: int,
    duration_ms: int | None,
    status_value: str = "completed",
    via: str = "dashboard",
) -> None:
    """
    Save one transfer event using its own database session.

    Failing to record an event must never break the upload or download
    itself, so errors are logged and swallowed.
    """
    db = SessionLocal()

    try:
        db.add(
            TransferEvent(
                kind=kind,
                user_id=user_id,
                user_name=(user_name or None) and user_name[:100],
                movie_id=movie_id,
                movie_title=(movie_title or None) and movie_title[:200],
                bytes_transferred=max(0, int(bytes_transferred)),
                total_bytes=max(0, int(total_bytes)),
                duration_ms=(
                    None if duration_ms is None else max(0, int(duration_ms))
                ),
                status=status_value,
                via=via,
            )
        )
        db.commit()

    except Exception:
        db.rollback()
        logger.exception("Could not record a %s event", kind)

    finally:
        db.close()


def clean_client_duration(value: int | None) -> int | None:
    """Accept a browser-reported duration only if it is plausible."""
    if value is None:
        return None

    if MIN_CLIENT_DURATION_MS <= value <= MAX_CLIENT_DURATION_MS:
        return int(value)

    return None


# --------------------------------------------------
# Download tickets (short-lived signed links)
# --------------------------------------------------

def make_download_ticket(
    user_id: int,
    movie_id: int,
    via: str = "dashboard",
) -> str:
    """
    Create a signed, short-lived ticket for one user and one file.

    The ticket is what lets a plain browser navigation start the download
    without an Authorization header. It is only issued after the normal
    permission checks pass.
    """
    now = datetime.now(timezone.utc)

    return jwt.encode(
        {
            "typ": "file-download",
            "sub": str(user_id),
            "mid": int(movie_id),
            "via": via,
            "iat": now,
            "exp": now + timedelta(seconds=DOWNLOAD_TICKET_SECONDS),
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def build_stream_path(ticket: str) -> str:
    """
    Path of the measured download endpoint for ``ticket``.

    Only the path is returned. The browser joins it with the same API
    address it already uses, so downloads work from any device and
    behind any proxy without a "public URL" setting.
    """
    return f"/movies/download/{ticket}"


def read_download_ticket(ticket: str) -> tuple[int, int, str]:
    """Return (user_id, movie_id, via) or raise a 4xx HTTPException."""
    try:
        payload = jwt.decode(
            ticket,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("typ") != "file-download":
            raise ValueError("wrong ticket type")

        via = payload.get("via")

        return (
            int(payload["sub"]),
            int(payload["mid"]),
            via if via in ("dashboard", "qr_scan") else "dashboard",
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This download link has expired. Request a new one.",
        )

    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This download link is not valid.",
        )


# --------------------------------------------------
# Measured streaming download
# --------------------------------------------------

def content_disposition(filename: str | None) -> str:
    """Safe ``attachment`` header for any filename."""
    from pathlib import Path
    from urllib.parse import quote

    name = Path(filename or "").name or "movie"

    ascii_name = name.encode("ascii", "ignore").decode("ascii")
    ascii_name = "".join(
        char if char.isalnum() or char in " ._-()" else "_"
        for char in ascii_name
    ).strip() or "movie"

    return (
        f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{quote(name, safe='')}"
    )


def open_measured_download(
    *,
    s3,
    bucket: str,
    movie: Movie,
    user: User,
    via: str,
) -> StreamingResponse:
    """
    Stream a movie from private storage and record the transfer.

    One ``download`` event is saved when the response ends:
      * ``completed``  every byte was sent
      * ``aborted``    the connection ended early (partial bytes recorded)
    """
    try:
        stored = s3.get_object(Bucket=bucket, Key=movie.storage_key)

    except ClientError:
        logger.exception("Could not open movie %s in storage", movie.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not read the file from storage.",
        )

    body = stored["Body"]
    total_bytes = int(stored.get("ContentLength") or movie.file_size or 0)

    user_id, user_name = user.id, user.name
    movie_id, movie_title = movie.id, movie.title

    async def generate():
        sent = 0
        started = time.monotonic()

        try:
            chunks = body.iter_chunks(STREAM_CHUNK_BYTES)

            while True:
                chunk = await run_in_threadpool(next, chunks, None)

                if chunk is None:
                    break

                sent += len(chunk)
                yield chunk

        finally:
            elapsed_ms = int((time.monotonic() - started) * 1000)

            try:
                body.close()
            except Exception:
                pass

            finished = total_bytes > 0 and sent >= total_bytes

            record_event(
                kind="download",
                user_id=user_id,
                user_name=user_name,
                movie_id=movie_id,
                movie_title=movie_title,
                bytes_transferred=sent,
                total_bytes=total_bytes,
                duration_ms=max(1, elapsed_ms),
                status_value="completed" if finished else "aborted",
                via=via,
            )

    headers = {
        **NO_STORE_HEADERS,
        "Content-Disposition": content_disposition(movie.original_filename),
        "Referrer-Policy": "no-referrer",
    }

    if total_bytes:
        headers["Content-Length"] = str(total_bytes)

    return StreamingResponse(
        generate(),
        # Always a plain download: the browser must never open or run it.
        media_type="application/octet-stream",
        headers=headers,
    )
