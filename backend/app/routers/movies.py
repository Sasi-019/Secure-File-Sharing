import logging
import os
import uuid
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db

from app.routers.routes import get_current_user
from app.transfers import (
    DOWNLOAD_TICKET_SECONDS,
    build_stream_path,
    clean_client_duration,
    make_download_ticket,
    open_measured_download,
    read_download_ticket,
    record_event,
)

from app.models import (
    Movie,
    SharingRequest,
    TransferEvent,
    User,
)
# Load environment variables from backend/.env
load_dotenv()

router = APIRouter(prefix="/movies", tags=["Files"])

logger = logging.getLogger(__name__)


# Backblaze B2 configuration
B2_KEY_ID = os.getenv("B2_KEY_ID")
B2_APPLICATION_KEY = os.getenv("B2_APPLICATION_KEY")
B2_BUCKET_NAME = os.getenv("B2_BUCKET_NAME")
B2_ENDPOINT_URL = os.getenv("B2_ENDPOINT_URL")

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

# Any file type may be shared, except programs that run on a computer.
# Blocking them keeps FileShare from being used to pass around malware.
BLOCKED_EXTENSIONS = {
    ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".pif",
    ".vbs", ".vbe", ".ps1", ".jar", ".apk", ".dll", ".lnk",
}


def get_s3_client():
    """Create a Backblaze B2 S3-compatible client."""

    if not all(
        [
            B2_KEY_ID,
            B2_APPLICATION_KEY,
            B2_BUCKET_NAME,
            B2_ENDPOINT_URL,
        ]
    ):
        raise HTTPException(
            status_code=500,
            detail="Backblaze storage is not configured.",
        )

    return boto3.client(
        "s3",
        endpoint_url=B2_ENDPOINT_URL,
        aws_access_key_id=B2_KEY_ID,
        aws_secret_access_key=B2_APPLICATION_KEY,
        region_name="us-east-005",
    )


def serialize_movie(
    movie: Movie,
    uploader: User | None = None,
    my_request_status: str | None = None,
):
    """
    Convert a file database record into a response.

    Includes uploader details but never exposes the private
    Backblaze storage key. ``my_request_status`` is the signed-in user's
    own access request for this file: None, "pending", "accepted" or
    "rejected".
    """

    result = {
        "id": movie.id,
        "title": movie.title,
        "description": movie.description,
        "original_filename": movie.original_filename,
        "content_type": movie.content_type,
        "file_size": movie.file_size,
        "owner_id": movie.owner_id,
        "created_at": movie.created_at,
        "my_request_status": my_request_status,
    }

    # Include uploader information when the user record is available.
    if uploader is not None:
        result["uploader"] = {
            "id": uploader.id,
            "name": uploader.name,
            "email": uploader.email,
        }

    return result


def request_statuses_for(db: Session, user_id: int) -> dict[int, str]:
    """{file id: status} of every access request this user has made."""
    rows = (
        db.query(SharingRequest.movie_id, SharingRequest.status)
        .filter(SharingRequest.requester_id == user_id)
        .all()
    )

    return {movie_id: request_status for movie_id, request_status in rows}


# --------------------------------------------------
# 1. UPLOAD A FILE
# --------------------------------------------------

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_movie(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to private B2 storage."""

    title = title.strip()

    if not title or len(title) > 200:
        raise HTTPException(
            status_code=400,
            detail="Title must contain between 1 and 200 characters.",
        )

    original_filename = Path(file.filename or "").name

    if not original_filename:
        raise HTTPException(
            status_code=400,
            detail="A filename is required.",
        )

    extension = Path(original_filename).suffix.lower()

    if extension in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{extension} files cannot be shared "
                "because they can run programs."
            ),
        )

    content_type = (
        (file.content_type or "").split(";")[0].strip().lower()
        or "application/octet-stream"
    )[:100]

    try:
        contents = await file.read(MAX_FILE_SIZE + 1)

        if not contents:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="The maximum upload size is 100 MB.",
            )

        # A very long "extension" is just part of an odd filename.
        safe_extension = extension if len(extension) <= 12 else ""

        storage_key = f"movies/{uuid.uuid4().hex}{safe_extension}"

        s3 = get_s3_client()

        try:
            s3.put_object(
                Bucket=B2_BUCKET_NAME,
                Key=storage_key,
                Body=contents,
                ContentType=content_type,
            )
        except ClientError:
            raise HTTPException(
                status_code=502,
                detail="Could not upload the file to cloud storage.",
            )

        movie = Movie(
            title=title,
            description=description.strip() or None,
            storage_key=storage_key,
            original_filename=original_filename,
            content_type=content_type,
            file_size=len(contents),
            owner_id=current_user.id,
        )

        try:
            db.add(movie)
            db.commit()
            db.refresh(movie)

        except Exception:
            db.rollback()

            try:
                s3.delete_object(
                    Bucket=B2_BUCKET_NAME,
                    Key=storage_key,
                )
            except ClientError:
                pass

            raise HTTPException(
                status_code=500,
                detail="Could not save the file record.",
            )

        # Record the upload for the statistics dashboards.
        record_event(
            kind="upload",
            user_id=current_user.id,
            user_name=current_user.name,
            movie_id=movie.id,
            movie_title=movie.title,
            bytes_transferred=len(contents),
            total_bytes=len(contents),
            duration_ms=None,  # filled in by POST /movies/{id}/upload-timing
            status_value="completed",
            via="dashboard",
        )

        return {
            "message": "File uploaded successfully.",
            "movie": serialize_movie(
                movie,
                uploader=current_user,
            ),
        }

    finally:
        await file.close()


# --------------------------------------------------
# 2. LIST ALL FILES WITH UPLOADER DETAILS
# --------------------------------------------------

@router.get("/")
def list_movies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Every authenticated user can see all uploaded files
    and their uploader's name and email, together with their own
    access-request status for each file.

    Download permissions are enforced separately by the
    download endpoint.

    Private storage keys are never returned.
    """

    movies_with_uploaders = (
        db.query(Movie, User)
        .join(User, Movie.owner_id == User.id)
        .order_by(Movie.created_at.desc())
        .all()
    )

    my_requests = request_statuses_for(db, current_user.id)

    movies = [
        serialize_movie(
            movie,
            uploader=uploader,
            my_request_status=my_requests.get(movie.id),
        )
        for movie, uploader in movies_with_uploaders
    ]

    return {
        "total": len(movies),
        "movies": movies,
    }

# --------------------------------------------------
# 3. SEARCH FILES
# --------------------------------------------------

@router.get("/search")
def search_movies(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search files by title or description.

    Returns matching files with uploader details.
    Private Backblaze storage keys are never returned.
    """

    search_term = q.strip()

    if not search_term:
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty.",
        )

    if len(search_term) > 200:
        raise HTTPException(
            status_code=400,
            detail="Search query cannot exceed 200 characters.",
        )

    search_pattern = f"%{search_term}%"

    results = (
        db.query(Movie, User)
        .join(User, Movie.owner_id == User.id)
        .filter(
            Movie.title.ilike(search_pattern)
            | Movie.description.ilike(search_pattern)
        )
        .order_by(Movie.created_at.desc())
        .limit(50)
        .all()
    )

    my_requests = request_statuses_for(db, current_user.id)

    movies = [
        serialize_movie(
            movie,
            uploader=uploader,
            my_request_status=my_requests.get(movie.id),
        )
        for movie, uploader in results
    ]

    return {
        "query": search_term,
        "total": len(movies),
        "movies": movies,
    }


# --------------------------------------------------
# 4. GET A DOWNLOAD LINK
# --------------------------------------------------

@router.get("/{movie_id}/download")
def download_movie(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived download link for a file.

    Access is allowed only to:
    1. The file's owner.
    2. A user whose access request the owner has accepted.

    Administrators get no special access: they must request a file and be
    accepted like everyone else. The file's owner must still be active.
    Private Backblaze storage keys are never returned.
    """

    # 1. Reject inactive users.
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    # 2. Find the requested file.
    movie = (
        db.query(Movie)
        .filter(Movie.id == movie_id)
        .first()
    )

    if movie is None:
        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    # 3. Confirm that the file's owner exists and is active.
    owner = (
        db.query(User)
        .filter(User.id == movie.owner_id)
        .first()
    )

    if owner is None or not owner.is_active:
        raise HTTPException(
            status_code=403,
            detail="This file's owner is inactive.",
        )

    # 4. The owner may always download. Everyone else needs an accepted
    # request for this exact file.
    is_owner = movie.owner_id == current_user.id

    if not is_owner:
        accepted_request = (
            db.query(SharingRequest)
            .filter(
                SharingRequest.movie_id == movie.id,
                SharingRequest.requester_id == current_user.id,
                SharingRequest.owner_id == movie.owner_id,
                SharingRequest.status == "accepted",
            )
            .first()
        )

        if accepted_request is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You need the owner's approval to download this "
                    "file. Request access first."
                ),
            )

    # 5. Issue a short-lived signed link to the measured download endpoint.
    # The file is streamed through this backend (see app/transfers.py) so
    # the transfer's size, speed and duration can be recorded. The private
    # storage key never leaves the server.
    ticket = make_download_ticket(current_user.id, movie.id, via="dashboard")

    return {
        "message": "Download link generated successfully.",
        "movie_id": movie.id,
        "title": movie.title,
        "download_path": build_stream_path(ticket),
        "expires_in_seconds": DOWNLOAD_TICKET_SECONDS,
        "access_type": "owner" if is_owner else "shared",
    }


# --------------------------------------------------
# 4b. DELETE A FILE (OWNER ONLY)
# --------------------------------------------------

def remove_from_storage(s3, key: str) -> None:
    """
    Permanently remove a stored object, including every old version.

    Backblaze buckets keep all versions by default, and a plain delete only
    hides the newest one, so the data would stay stored. Every version of
    this key is deleted. If the storage key cannot list versions, a plain
    delete is used instead.
    """
    try:
        listing = s3.list_object_versions(Bucket=B2_BUCKET_NAME, Prefix=key)

        targets = [
            {"Key": item["Key"], "VersionId": item["VersionId"]}
            for item in (
                listing.get("Versions", [])
                + listing.get("DeleteMarkers", [])
            )
            if item["Key"] == key and item.get("VersionId")
        ]

    except ClientError:
        logger.warning(
            "Could not list versions of %s; using a plain delete", key
        )
        targets = []

    if not targets:
        s3.delete_object(Bucket=B2_BUCKET_NAME, Key=key)
        return

    result = s3.delete_objects(
        Bucket=B2_BUCKET_NAME,
        Delete={"Objects": targets, "Quiet": True},
    )

    if result.get("Errors"):
        raise ClientError(
            {"Error": {"Code": "DeleteFailed", "Message": str(result["Errors"])}},
            "DeleteObjects",
        )


@router.delete("/{movie_id}")
def delete_movie(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a file for good. Only its owner can do this.

    The stored data is removed first, then the database record (which also
    removes its access requests). If storage fails nothing is changed, and
    if the record cannot be removed afterwards, pressing Delete again
    finishes the job because removing a missing object is harmless.
    """

    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    movie = (
        db.query(Movie)
        .filter(Movie.id == movie_id)
        .first()
    )

    if movie is None:
        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    if movie.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the owner can delete this file.",
        )

    title = movie.title
    storage_key = movie.storage_key

    try:
        remove_from_storage(get_s3_client(), storage_key)

    except ClientError:
        logger.exception("Could not delete %s from storage", storage_key)
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not delete the file from cloud storage. "
                "Nothing was changed. Please try again."
            ),
        )

    try:
        db.delete(movie)
        db.commit()

    except Exception:
        db.rollback()
        logger.exception("Could not delete the record of file %s", movie_id)
        raise HTTPException(
            status_code=500,
            detail=(
                "The stored file was removed but its record could not be "
                "deleted. Press Delete again to finish."
            ),
        )

    return {
        "message": f"'{title}' was deleted.",
        "movie_id": movie_id,
    }


# --------------------------------------------------
# 5. MEASURED DOWNLOAD (SIGNED LINK, NO LOGIN HEADER NEEDED)
# --------------------------------------------------

@router.get("/download/{ticket}")
def stream_download(
    ticket: str,
    db: Session = Depends(get_db),
):
    """
    Stream a movie to the browser and record the transfer.

    ``ticket`` is a signed, short-lived link created by
    ``GET /movies/{movie_id}/download``, so this
    endpoint can be opened directly by a browser or a phone.

    The size, duration and speed of every download are recorded for the
    administrator's statistics.
    """

    user_id, movie_id, via = read_download_ticket(ticket)

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account is not allowed to download.",
        )

    movie = db.query(Movie).filter(Movie.id == movie_id).first()

    if movie is None:
        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    # Everything needed is read before the response starts, because the
    # database session is closed once this function returns.
    return open_measured_download(
        s3=get_s3_client(),
        bucket=B2_BUCKET_NAME,
        movie=movie,
        user=user,
        via=via,
    )


# --------------------------------------------------
# 6. UPLOAD TIMING (REPORTED BY THE UPLOADER'S BROWSER)
# --------------------------------------------------

class UploadTiming(BaseModel):
    duration_ms: int = Field(ge=1)


@router.post("/{movie_id}/upload-timing")
def report_upload_timing(
    movie_id: int,
    timing: UploadTiming,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Attach the browser-measured upload time to the upload that was just
    recorded. Only the uploader can do this, and only once per upload.

    The server cannot see network time itself (the whole file has already
    arrived when the upload handler runs), so the browser reports it.
    """

    duration_ms = clean_client_duration(timing.duration_ms)

    if duration_ms is None:
        raise HTTPException(
            status_code=400,
            detail="That upload duration is not plausible.",
        )

    event = (
        db.query(TransferEvent)
        .filter(
            TransferEvent.kind == "upload",
            TransferEvent.movie_id == movie_id,
            TransferEvent.user_id == current_user.id,
            TransferEvent.duration_ms.is_(None),
        )
        .order_by(TransferEvent.created_at.desc())
        .first()
    )

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="No untimed upload found for this file.",
        )

    event.duration_ms = duration_ms

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the upload timing.",
        )

    return {"message": "Upload timing saved."}
