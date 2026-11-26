"""
Company rules shared by the routers: storage quota, notifications and the
people a file may be shared with.
"""
import os

from fastapi import HTTPException

from app.models import FileShare, Movie, Notification, User

# Storage each employee gets unless the administrator sets another amount.
DEFAULT_QUOTA_MB = int(os.getenv("DEFAULT_QUOTA_MB", "500"))
DEFAULT_QUOTA_BYTES = DEFAULT_QUOTA_MB * 1024 * 1024

MAX_RECIPIENTS = 50


def quota_for(user: User) -> int:
    """Bytes this person may store."""
    if user.storage_quota_bytes is not None:
        return int(user.storage_quota_bytes)
    return DEFAULT_QUOTA_BYTES


def used_by(db, user_id: int) -> int:
    """Bytes of the files this person owns."""
    rows = db.query(Movie.file_size).filter(Movie.owner_id == user_id).all()
    return int(sum(int(r[0] or 0) for r in rows))


def storage_summary(db, user: User) -> dict:
    used = used_by(db, user.id)
    quota = quota_for(user)
    return {
        "used_bytes": used,
        "quota_bytes": quota,
        "remaining_bytes": max(quota - used, 0),
    }


def notify(db, user_ids, type_: str, message: str, movie_id=None) -> None:
    """Queue one notification per person. The caller commits."""
    for uid in user_ids:
        db.add(
            Notification(
                user_id=uid,
                type=type_,
                message=message[:500],
                movie_id=movie_id,
                is_read=False,
            )
        )


def parse_recipient_ids(raw) -> list[int]:
    """Turn '3,5, 7' (or a list) into [3, 5, 7] without duplicates."""
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip()]
    else:
        parts = list(raw)
    out: list[int] = []
    for p in parts:
        try:
            n = int(p)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid recipient.")
        if n not in out:
            out.append(n)
    return out


def check_recipients(db, owner: User, ids: list[int]) -> list[User]:
    """
    The people a file may be shared with: existing, active, not yourself.
    (The page lists everyone except the administrator in the picker, but
    sending to the administrator is allowed through "Message admin".)
    """
    if len(ids) > MAX_RECIPIENTS:
        raise HTTPException(
            status_code=400,
            detail=f"You can share with at most {MAX_RECIPIENTS} people.",
        )

    people = []
    for uid in ids:
        if uid == owner.id:
            continue
        person = db.query(User).filter(User.id == uid).first()
        if person is None or not person.is_active:
            raise HTTPException(
                status_code=400,
                detail="One of the chosen people cannot receive files.",
            )
        people.append(person)
    return people


def set_shares(db, movie: Movie, people: list[User]) -> list[User]:
    """Make `people` exactly the set the file is shared with. Returns the
    people who are newly added (to notify them)."""
    current = db.query(FileShare).filter(FileShare.movie_id == movie.id).all()
    keep = {p.id for p in people}
    have = {s.user_id for s in current}

    for share in current:
        if share.user_id not in keep:
            db.delete(share)

    added = []
    for person in people:
        if person.id not in have:
            db.add(FileShare(movie_id=movie.id, user_id=person.id))
            added.append(person)
    return added


def shared_with(db, movie_id: int) -> list[int]:
    rows = db.query(FileShare.user_id).filter(FileShare.movie_id == movie_id).all()
    return [int(r[0]) for r in rows]


def can_see_file(db, user: User, movie: Movie) -> bool:
    """Owner, anyone (public, owner active) or a chosen person (shared)."""
    if movie.owner_id == user.id:
        return True
    if movie.visibility == "public":
        return True
    if movie.visibility == "shared":
        return user.id in shared_with(db, movie.id)
    return False
