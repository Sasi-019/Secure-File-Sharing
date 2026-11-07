from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import analytics
from app.database import get_db
from app.models import TransferEvent, User
from app.routers.routes import get_current_user
from app.sqlhelpers import bucket_of, utc

router = APIRouter(prefix="/stats", tags=["Statistics"])

# How many days the personal activity chart covers.
PERSONAL_DAYS = 14


@router.get("/me")
def my_statistics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The signed-in user's OWN upload and download statistics.

    Every query is filtered by the caller's id. Platform-wide analytics
    live under /admin and are administrator-only.
    """

    mine = TransferEvent.user_id == current_user.id
    done = TransferEvent.status == "completed"
    timed = done & TransferEvent.duration_ms.is_not(None)

    def total(expression):
        return func.coalesce(func.sum(expression), 0)

    totals = (
        db.query(
            total(case((done & (TransferEvent.kind == "upload"), 1), else_=0)).label("uploads"),
            total(case((done & (TransferEvent.kind == "download"), 1), else_=0)).label("downloads"),
            total(case((timed & (TransferEvent.kind == "upload"), TransferEvent.bytes_transferred), else_=0)).label("up_bytes"),
            total(case((timed & (TransferEvent.kind == "upload"), TransferEvent.duration_ms), else_=0)).label("up_ms"),
            total(case((timed & (TransferEvent.kind == "download"), TransferEvent.bytes_transferred), else_=0)).label("down_bytes"),
            total(case((timed & (TransferEvent.kind == "download"), TransferEvent.duration_ms), else_=0)).label("down_ms"),
        )
        .filter(mine)
        .one()
    )

    # Daily counts for the small activity chart.
    starts = analytics.bucket_starts("day")[-PERSONAL_DAYS:]

    day = bucket_of("day", TransferEvent.created_at).label("day")

    rows = (
        db.query(
            day,
            TransferEvent.kind,
            func.count(TransferEvent.id).label("transfers"),
        )
        .filter(
            mine,
            done,
            utc(TransferEvent.created_at) >= starts[0],
        )
        .group_by(day, TransferEvent.kind)
        .all()
    )

    per_kind = {"upload": {}, "download": {}}

    for row in rows:
        start = analytics.normalise_bucket(row.day)

        if row.kind in per_kind and start is not None:
            per_kind[row.kind][start] = int(row.transfers)

    first_event = (
        db.query(func.min(TransferEvent.created_at)).filter(mine).scalar()
    )

    return {
        "uploads": int(totals.uploads),
        "downloads": int(totals.downloads),
        "upload_speed_bytes_per_second": analytics.speed_bytes_per_second(
            int(totals.up_bytes), int(totals.up_ms)
        ),
        "download_speed_bytes_per_second": analytics.speed_bytes_per_second(
            int(totals.down_bytes), int(totals.down_ms)
        ),
        "tracking_since": first_event.isoformat() if first_event else None,
        "labels": [analytics.label(start) for start in starts],
        "daily_uploads": analytics.align(starts, per_kind["upload"], 0),
        "daily_downloads": analytics.align(starts, per_kind["download"], 0),
    }
