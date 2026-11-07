"""
SQL building blocks shared by the analytics queries.

Time-zone and bucket names are rendered as SQL literals, not bound
parameters. With psycopg 3 every bound value is sent as a numbered
parameter ($1, $2, ...), and PostgreSQL then sees ``date_trunc($1, ...)`` in
the SELECT list and ``date_trunc($2, ...)`` in the GROUP BY as two
different expressions and rejects the query. Literals avoid that.

The bucket name is checked against a fixed whitelist first, so nothing
user-supplied is ever written into the SQL text.
"""
from sqlalchemy import func, literal_column

from app.analytics import PERIODS


def utc(column):
    """``column`` converted to a naive UTC timestamp."""
    return func.timezone(literal_column("'UTC'"), column)


def bucket_of(period: str, column):
    """UTC calendar bucket (day / week / month) that ``column`` falls in."""
    if period not in PERIODS:
        raise ValueError(f"Unknown period: {period}")

    return func.date_trunc(
        literal_column(f"'{period}'"),
        utc(column),
    )
