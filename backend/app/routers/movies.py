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

from app.categories import VISIBILITIES, file_category
from app.company import (
    can_see_file,
    check_recipients,
    notify,
    parse_recipient_ids,
    quota_for,
    set_shares,
    shared_with,
    used_by,
)
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
    FileShare,
    Movie,
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
    current_user_id: int | None = None,
    recipients: list | None = None,
):
    """
    Convert a file database record into a response.

    Includes uploader details but never exposes the private
    Backblaze storage key. ``category`` (images, videos, pdfs, ...) is worked
    out from the file type, and ``is_owner`` tells the page which buttons to
    show.
    """

    result = {
        "id": movie.id,
        "title": movie.title,
        "description": movie.description,
        "original_filename": movie.original_filename,
        "content_type": movie.content_type,
        "file_size": movie.file_size,
        "owner_id": movie.owner_id,
        "visibility": movie.visibility,
        "category": file_category(movie.original_filename, movie.content_type),
        "is_owner": (
            current_user_id is not None
            and movie.owner_id == current_user_id
        ),
        "created_at": movie.created_at,
        # A public file posted by the administrator is an announcement.
        "is_announcement": (
            movie.visibility == "public"
            and uploader is not None
            and uploader.role == "admin"
        ),
        "shared_with_me": (
            movie.visibility == "shared"
            and current_user_id is not None
            and movie.owner_id != current_user_id
        ),
    }

    # Only the owner is told who a file is shared with.
    if recipients is not None and result["is_owner"]:
        result["shared_with"] = recipients

    # Include uploader information when the user record is available.
    if uploader is not None:
        result["uploader"] = {
            "id": uploader.id,
            "name": uploader.name,
            "email": uploader.email,
            "role": uploader.role,
        }

    return result


def recipients_of(db: Session, movie: Movie) -> list[dict]:
    """The people (id, name) a shared file has been shared with."""
    out = []
    for uid in shared_with(db, movie.id):
        person = db.query(User).filter(User.id == uid).first()
        if person is not None:
            out.append({"id": person.id, "name": person.name})
    return out


def visible_to(user: User, db: Session):
    """
    SQL condition: the files this user may see and download.

    * their own files, whatever the setting;
    * every other ACTIVE user's PUBLIC files;
    * files another person SHARED with them.

    Administrators get no extra access: another user's private or shared
    file stays invisible to them too, unless it was shared with them.
    """
    shared_ids = [
        int(r[0])
        for r in db.query(FileShare.movie_id)
        .filter(FileShare.user_id == user.id)
        .all()
    ]

    return (
        (Movie.owner_id == user.id)
        | ((Movie.visibility == "public") & (User.is_active.is_(True)))
        | ((Movie.visibility == "shared") & (Movie.id.in_(shared_ids)))
    )


def clean_visibility(value: str) -> str:
    value = (value or "").strip().lower()

    if value not in VISIBILITIES:
        raise HTTPException(
            status_code=400,
            detail="Visibility must be 'private', 'public' or 'shared'.",
        )

    return value


def announce_public(db: Session, movie: Movie, owner: User) -> None:
    """Tell every other active employee that a file went public."""
    people = (
        db.query(User.id)
        .filter(User.is_active.is_(True))
        .all()
    )
    ids = [int(r[0]) for r in people if int(r[0]) != owner.id]

    if owner.role == "admin":
        text = f"Announcement from {owner.name}: '{movie.title}'"
        kind = "announcement"
    else:
        text = f"{owner.name} posted '{movie.title}' for everyone."
        kind = "public_file"

    notify(db, ids, kind, text, movie.id)


# --------------------------------------------------
# 1. UPLOAD A FILE
# --------------------------------------------------

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_movie(
    title: str = Form(...),
    description: str = Form(""),
    visibility: str = Form("private"),
    recipients: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to private B2 storage."""

    title = title.strip()
    visibility = clean_visibility(visibility)
    people = check_recipients(
        db, current_user, parse_recipient_ids(recipients)
    )

    if visibility == "shared" and not people:
        raise HTTPException(
            status_code=400,
            detail="Choose at least one person to share the file with.",
        )

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

        # Each person has a storage allowance.
        quota = quota_for(current_user)
        used = used_by(db, current_user.id)

        if used + len(contents) > quota:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Not enough storage left. You have used "
                    f"{used // (1024 * 1024)} MB of {quota // (1024 * 1024)} MB. "
                    "Delete a file or ask the administrator for more space."
                ),
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
            visibility=visibility,
        )

        try:
            db.add(movie)
            db.flush()

            if visibility == "shared":
                set_shares(db, movie, people)
                notify(
                    db,
                    [p.id for p in people],
                    "shared_file",
                    f"{current_user.name} shared '{title}' with you.",
                    movie.id,
                )
            elif visibility == "public":
                announce_public(db, movie, current_user)

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
                current_user_id=current_user.id,
                recipients=recipients_of(db, movie),
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
    The files the signed-in user may see: all of their own files plus every
    other user's PUBLIC files. Other people's private files never appear,
    not even for administrators.

    Private storage keys are never returned.
    """

    rows = (
        db.query(Movie, User)
        .join(User, Movie.owner_id == User.id)
        .filter(visible_to(current_user, db))
        .order_by(Movie.created_at.desc())
        .all()
    )

    movies = [
        serialize_movie(
            movie,
            uploader=uploader,
            current_user_id=current_user.id,
            recipients=(
                recipients_of(db, movie)
                if movie.visibility == "shared"
                and movie.owner_id == current_user.id
                else None
            ),
        )
        for movie, uploader in rows
    ]

    # Announcements from the administrator stay at the top.
    movies.sort(key=lambda m: not m["is_announcement"])

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
    Search the files you may see (your own plus others' public files) by
    title or description. Returns matching files with uploader details.
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
            visible_to(current_user, db),
            Movie.title.ilike(search_pattern)
            | Movie.description.ilike(search_pattern),
        )
        .order_by(Movie.created_at.desc())
        .limit(50)
        .all()
    )

    movies = [
        serialize_movie(
            movie,
            uploader=uploader,
            current_user_id=current_user.id,
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

    Allowed for:
    1. The file's owner (public or private file).
    2. Anyone signed in, administrators included, when the file is PUBLIC
       and its owner's account is active.

    A private file that is not yours answers "not found", so its existence
    is not revealed. Private Backblaze storage keys are never returned.
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

    is_owner = movie.owner_id == current_user.id

    # 3. A file that is not yours, not public and not shared with you is
    # invisible to you.
    if not can_see_file(db, current_user, movie):
        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    # 4. A public file of a blocked owner cannot be downloaded.
    if not is_owner:
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

    # 5. Issue a short-lived signed link to the measured download endpoint.
    # The file is streamed through this backend (see app/transfers.py) so
    # the transfer's size, speed and duration can be recorded. The private
    # storage key never leaves the server.
    ticket = make_download_ticket(current_user.id, movie.id, via="dashboard")

    return {
        "message": "Download link generated successfully.",
        "movie_id": movie.id,
        "title": movie.title,
        "filename": movie.original_filename,
        "file_size": movie.file_size,
        "download_path": build_stream_path(ticket),
        "expires_in_seconds": DOWNLOAD_TICKET_SECONDS,
        "access_type": (
            "owner"
            if is_owner
            else ("shared" if movie.visibility == "shared" else "public")
        ),
    }


# --------------------------------------------------
# 4a. CHANGE A FILE'S VISIBILITY (OWNER ONLY)
# --------------------------------------------------

class VisibilityChange(BaseModel):
    visibility: str
    # Needed when visibility is "shared": the people to share with.
    recipients: list[int] = []


@router.patch("/{movie_id}/visibility")
def change_visibility(
    movie_id: int,
    change: VisibilityChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Make one of your own files private, public or shared with people."""

    visibility = clean_visibility(change.visibility)

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

    # Another user's file is reported as missing, public or not.
    if movie is None or movie.owner_id != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    people = check_recipients(
        db, current_user, parse_recipient_ids(change.recipients)
    )

    if visibility == "shared" and not people:
        raise HTTPException(
            status_code=400,
            detail="Choose at least one person to share the file with.",
        )

    was_public = movie.visibility == "public"
    movie.visibility = visibility

    try:
        if visibility == "shared":
            added = set_shares(db, movie, people)
            notify(
                db,
                [p.id for p in added],
                "shared_file",
                f"{current_user.name} shared '{movie.title}' with you.",
                movie.id,
            )
        else:
            # Private and public files have no list of people.
            set_shares(db, movie, [])

        if visibility == "public" and not was_public:
            announce_public(db, movie, current_user)

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not change the file's visibility.",
        )

    label = {
        "public": "public",
        "private": "private",
        "shared": "shared with the chosen people",
    }[visibility]

    return {
        "message": f"'{movie.title}' is now {label}.",
        "movie_id": movie.id,
        "visibility": visibility,
        "shared_with": recipients_of(db, movie),
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

    The stored data is removed first, then the database record. If storage fails nothing is changed, and
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
        # A file you cannot see is not even reported as existing.
        if not can_see_file(db, current_user, movie):
            raise HTTPException(
                status_code=404,
                detail="File not found.",
            )

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
