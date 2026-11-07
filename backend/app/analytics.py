"""
Pure helpers for the analytics endpoints (no database access here).

All buckets are in UTC. Empty buckets are returned as zeros / ``None`` so a
chart shows a gap instead of an invented value.
"""
from datetime import datetime, timedelta, timezone

PERIODS = ("day", "week", "month")

# How many buckets each period shows.
BUCKET_COUNTS = {"day": 30, "week": 12, "month": 12}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def floor_to_period(moment: datetime, period: str) -> datetime:
    """Start of the day / ISO week (Monday) / month, as a naive UTC time."""
    moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "day":
        return day

    if period == "week":
        return day - timedelta(days=day.weekday())

    if period == "month":
        return day.replace(day=1)

    raise ValueError(f"Unknown period: {period}")


def step_back(start: datetime, period: str) -> datetime:
    """The bucket start immediately before ``start``."""
    if period == "day":
        return start - timedelta(days=1)

    if period == "week":
        return start - timedelta(weeks=1)

    if period == "month":
        year, month = (start.year - 1, 12) if start.month == 1 else (
            start.year,
            start.month - 1,
        )
        return start.replace(year=year, month=month, day=1)

    raise ValueError(f"Unknown period: {period}")


def bucket_starts(period: str, now: datetime | None = None) -> list[datetime]:
    """Oldest-first bucket starts ending with the current period."""
    current = floor_to_period(now or utc_now(), period)
    starts = [current]

    for _ in range(BUCKET_COUNTS[period] - 1):
        starts.append(step_back(starts[-1], period))

    return list(reversed(starts))


def normalise_bucket(value) -> datetime | None:
    """Make a database bucket value comparable with ``bucket_starts``."""
    if value is None:
        return None

    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)

    return value


def speed_bytes_per_second(total_bytes: int, total_ms: int) -> float | None:
    """Average speed, or ``None`` when nothing was measured."""
    if not total_ms or total_ms <= 0 or not total_bytes:
        return None

    return round(total_bytes * 1000 / total_ms, 2)


def average_ms(total_ms: int, count: int) -> float | None:
    """Average duration, or ``None`` when nothing was measured."""
    if not count:
        return None

    return round(total_ms / count, 1)


def align(starts: list[datetime], values: dict, default):
    """Map ``{bucket_start: value}`` onto ``starts`` (missing -> default)."""
    return [values.get(start, default) for start in starts]


def cumulative_storage(
    starts: list[datetime],
    added_by_bucket: dict,
    baseline_bytes: int,
) -> list[int]:
    """Total bytes stored at the end of each bucket."""
    running = int(baseline_bytes or 0)
    result = []

    for start in starts:
        running += int(added_by_bucket.get(start, 0) or 0)
        result.append(running)

    return result


def label(start: datetime) -> str:
    return start.date().isoformat()
