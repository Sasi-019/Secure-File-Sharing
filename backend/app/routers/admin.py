from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import analytics
from app.database import get_db
from app.models import Movie, TransferEvent, User
from app.routers.routes import get_current_user
from app.sqlhelpers import bucket_of, utc


router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
)


# --------------------------------------------------
# 1. VERIFY ADMINISTRATOR PERMISSIONS
# --------------------------------------------------

def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allow access only to active administrator accounts."""

    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required",
        )

    return current_user


# --------------------------------------------------
# 2. ADMIN DASHBOARD STATISTICS
# --------------------------------------------------

@router.get("/dashboard")
def admin_dashboard(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return overall FileShare statistics."""

    total_users = db.query(User).count()
    total_movies = db.query(Movie).count()

    storage_used = (
        db.query(func.coalesce(func.sum(Movie.file_size), 0))
        .scalar()
    )

    return {
        "message": "Administrator dashboard data",
        "admin": {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email,
        },
        "statistics": {
            "total_users": total_users,
            "total_movies": total_movies,
            "total_storage_bytes": int(storage_used),
        },
    }


# --------------------------------------------------
# 3. LIST ALL USERS AND THEIR CONTRIBUTIONS
# --------------------------------------------------

@router.get("/users")
def list_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return all users with their file counts and storage usage."""

    user_statistics = (
        db.query(
            User.id,
            User.name,
            User.email,
            User.role,
            User.is_active,
            User.created_at,
            func.count(Movie.id).label("movies_uploaded"),
            func.coalesce(
                func.sum(Movie.file_size),
                0,
            ).label("storage_used_bytes"),
        )
        .outerjoin(
            Movie,
            Movie.owner_id == User.id,
        )
        .group_by(
            User.id,
            User.name,
            User.email,
            User.role,
            User.is_active,
            User.created_at,
        )
        .order_by(User.created_at.desc())
        .all()
    )

    users = []

    for user in user_statistics:
        users.append(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active,
                "created_at": user.created_at,
                "movies_uploaded": user.movies_uploaded,
                "storage_used_bytes": int(
                    user.storage_used_bytes or 0
                ),
            }
        )

    return {
        "total": len(users),
        "users": users,
    }


# --------------------------------------------------
# 4. BLOCK A USER
# --------------------------------------------------

@router.patch("/users/{user_id}/block")
def block_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Block a regular user from accessing FileShare."""

    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block your own administrator account",
        )

    if target_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be blocked through this endpoint",
        )

    if not target_user.is_active:
        return {
            "message": "User is already blocked",
            "user_id": target_user.id,
            "is_active": False,
        }

    target_user.is_active = False

    try:
        db.commit()
        db.refresh(target_user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to block user",
        )

    return {
        "message": "User blocked successfully",
        "user_id": target_user.id,
        "is_active": target_user.is_active,
    }


# --------------------------------------------------
# 5. UNBLOCK A USER
# --------------------------------------------------

@router.patch("/users/{user_id}/unblock")
def unblock_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Restore access for a blocked regular user."""

    target_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own administrator account status",
        )

    if target_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be managed through this endpoint",
        )

    if target_user.is_active:
        return {
            "message": "User is already active",
            "user_id": target_user.id,
            "is_active": True,
        }

    target_user.is_active = True

    try:
        db.commit()
        db.refresh(target_user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unblock user",
        )

    return {
        "message": "User unblocked successfully",
        "user_id": target_user.id,
        "is_active": target_user.is_active,
    }


# --------------------------------------------------
# 6. TRANSFER ANALYTICS (GRAPHS)
# --------------------------------------------------

@router.get("/analytics")
def admin_analytics(
    period: str = Query("day", description="day, week or month"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Time series for the administrator's graphs.

    Built only from recorded upload/download events and from the movies
    table. Periods with no recorded activity are zeros (or null for
    speed/duration), never estimates.
    """

    if period not in analytics.PERIODS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period must be day, week or month",
        )

    starts = analytics.bucket_starts(period)
    first_start = starts[0]

    # UTC calendar bucket of each event.
    bucket = bucket_of(period, TransferEvent.created_at).label("bucket")

    done = TransferEvent.status == "completed"
    timed = done & TransferEvent.duration_ms.is_not(None)

    def total(expression):
        return func.coalesce(func.sum(expression), 0)

    rows = (
        db.query(
            bucket,
            TransferEvent.kind,
            total(case((done, 1), else_=0)).label("transfers"),
            total(TransferEvent.bytes_transferred).label("bytes_moved"),
            total(case((timed, TransferEvent.bytes_transferred), else_=0))
            .label("timed_bytes"),
            total(case((timed, TransferEvent.duration_ms), else_=0))
            .label("timed_ms"),
            total(case((timed, 1), else_=0)).label("timed_count"),
        )
        .filter(
            utc(TransferEvent.created_at) >= first_start
        )
        .group_by(bucket, TransferEvent.kind)
        .all()
    )

    series = {
        kind: {
            "count": {},
            "bytes": {},
            "speed": {},
            "duration": {},
        }
        for kind in ("upload", "download")
    }

    for row in rows:
        start = analytics.normalise_bucket(row.bucket)
        target = series.get(row.kind)

        if target is None or start is None:
            continue

        target["count"][start] = int(row.transfers)
        target["bytes"][start] = int(row.bytes_moved)
        target["speed"][start] = analytics.speed_bytes_per_second(
            int(row.timed_bytes),
            int(row.timed_ms),
        )
        target["duration"][start] = analytics.average_ms(
            int(row.timed_ms),
            int(row.timed_count),
        )

    # Distinct active users per bucket.
    active_rows = (
        db.query(
            bucket,
            func.count(func.distinct(TransferEvent.user_id)).label("users"),
        )
        .filter(
            utc(TransferEvent.created_at) >= first_start,
            TransferEvent.user_id.is_not(None),
        )
        .group_by(bucket)
        .all()
    )

    active_users = {
        analytics.normalise_bucket(row.bucket): int(row.users)
        for row in active_rows
    }

    # Storage over time: movies are stored in the database with their
    # upload time, so this is real history, not an estimate.
    movie_bucket = bucket_of(period, Movie.created_at).label("bucket")

    storage_rows = (
        db.query(
            movie_bucket,
            func.coalesce(func.sum(Movie.file_size), 0).label("added"),
        )
        .filter(
            utc(Movie.created_at) >= first_start
        )
        .group_by(movie_bucket)
        .all()
    )

    added_by_bucket = {
        analytics.normalise_bucket(row.bucket): int(row.added)
        for row in storage_rows
    }

    baseline = (
        db.query(func.coalesce(func.sum(Movie.file_size), 0))
        .filter(
            utc(Movie.created_at) < first_start
        )
        .scalar()
    )

    first_event = db.query(func.min(TransferEvent.created_at)).scalar()

    def aligned(kind, field, default):
        return analytics.align(starts, series[kind][field], default)

    return {
        "period": period,
        "labels": [analytics.label(start) for start in starts],
        "tracking_since": (
            first_event.isoformat() if first_event else None
        ),
        "uploads": {
            "count": aligned("upload", "count", 0),
            "bytes": aligned("upload", "bytes", 0),
            "speed_bytes_per_second": aligned("upload", "speed", None),
            "average_duration_ms": aligned("upload", "duration", None),
        },
        "downloads": {
            "count": aligned("download", "count", 0),
            "bytes": aligned("download", "bytes", 0),
            "speed_bytes_per_second": aligned("download", "speed", None),
            "average_duration_ms": aligned("download", "duration", None),
        },
        "storage_bytes": analytics.cumulative_storage(
            starts,
            added_by_bucket,
            int(baseline or 0),
        ),
        "active_users": analytics.align(starts, active_users, 0),
    }


# --------------------------------------------------
# 7. USER ACTIVITY STATISTICS
# --------------------------------------------------

@router.get("/user-activity")
def admin_user_activity(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Most active users over the last ``days`` days."""

    since = analytics.utc_now() - timedelta(days=days)

    done = TransferEvent.status == "completed"

    rows = (
        db.query(
            TransferEvent.user_id,
            func.max(TransferEvent.user_name).label("name"),
            func.coalesce(
                func.sum(
                    case(
                        (done & (TransferEvent.kind == "upload"), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("uploads"),
            func.coalesce(
                func.sum(
                    case(
                        (done & (TransferEvent.kind == "download"), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("downloads"),
            func.coalesce(
                func.sum(TransferEvent.bytes_transferred), 0
            ).label("bytes_moved"),
            func.max(TransferEvent.created_at).label("last_active"),
        )
        .filter(
            TransferEvent.created_at >= since,
            TransferEvent.user_id.is_not(None),
        )
        .group_by(TransferEvent.user_id)
        .order_by(func.count(TransferEvent.id).desc())
        .limit(limit)
        .all()
    )

    active_total = (
        db.query(func.count(func.distinct(TransferEvent.user_id)))
        .filter(
            TransferEvent.created_at >= since,
            TransferEvent.user_id.is_not(None),
        )
        .scalar()
    )

    return {
        "days": days,
        "active_users": int(active_total or 0),
        "users": [
            {
                "user_id": row.user_id,
                "name": row.name,
                "uploads": int(row.uploads),
                "downloads": int(row.downloads),
                "bytes_moved": int(row.bytes_moved),
                "last_active": (
                    row.last_active.isoformat()
                    if row.last_active
                    else None
                ),
            }
            for row in rows
        ],
    }


# --------------------------------------------------
# 8. DOWNLOAD HISTORY
# --------------------------------------------------

@router.get("/downloads")
def admin_download_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Newest-first list of recorded downloads (file, user, time)."""

    query = db.query(TransferEvent).filter(
        TransferEvent.kind == "download"
    )

    total = query.count()

    events = (
        query.order_by(TransferEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "downloads": [
            {
                "id": event.id,
                "movie_id": event.movie_id,
                "movie_title": event.movie_title,
                "user_id": event.user_id,
                "user_name": event.user_name,
                "bytes_transferred": int(event.bytes_transferred),
                "total_bytes": int(event.total_bytes),
                "duration_ms": event.duration_ms,
                "speed_bytes_per_second": (
                    analytics.speed_bytes_per_second(
                        int(event.bytes_transferred),
                        int(event.duration_ms or 0),
                    )
                    if event.status == "completed"
                    else None
                ),
                "status": event.status,
                "via": event.via,
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ],
    }
