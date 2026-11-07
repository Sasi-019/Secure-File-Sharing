
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        default="user",
        server_default="user",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    movies: Mapped[list["Movie"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    sent_sharing_requests: Mapped[list["SharingRequest"]] = relationship(
        back_populates="requester",
        foreign_keys="SharingRequest.requester_id",
    )

    received_sharing_requests: Mapped[list["SharingRequest"]] = relationship(
        back_populates="owner",
        foreign_keys="SharingRequest.owner_id",
    )

    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Movie(Base):
    __tablename__ = "movies"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Internal Backblaze storage identifier.
    # Never expose this value in notifications or links.
    storage_key: Mapped[str] = mapped_column(
        String(500),
        unique=True,
        nullable=False,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    content_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    owner: Mapped["User"] = relationship(
        back_populates="movies",
    )

    sharing_requests: Mapped[list["SharingRequest"]] = relationship(
        back_populates="movie",
        cascade="all, delete-orphan",
    )


class SharingRequest(Base):
    __tablename__ = "sharing_requests"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')",
            name="ck_sharing_requests_status",
        ),
        UniqueConstraint(
            "movie_id",
            "requester_id",
            name="uq_sharing_requests_movie_requester",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    movie_id: Mapped[int] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    requester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default="pending",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    movie: Mapped["Movie"] = relationship(
        back_populates="sharing_requests",
    )

    requester: Mapped["User"] = relationship(
        back_populates="sent_sharing_requests",
        foreign_keys=[requester_id],
    )

    owner: Mapped["User"] = relationship(
        back_populates="received_sharing_requests",
        foreign_keys=[owner_id],
    )

    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="sharing_request",
        cascade="all, delete-orphan",
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sharing_request_id: Mapped[int | None] = mapped_column(
        ForeignKey("sharing_requests.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        back_populates="notifications",
    )

    sharing_request: Mapped["SharingRequest | None"] = relationship(
        back_populates="notifications",
    )


# NOT USED ANY MORE. QR downloading was removed, but this table and the
# MovieAccessGrant table below are left in place so no migration is needed.
# They can be dropped later with a migration.
class SharingQRToken(Base):
    __tablename__ = "sharing_qr_tokens"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    sharing_request_id: Mapped[int] = mapped_column(
        ForeignKey("sharing_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Store only the hash of the secret token, never the raw token.
    token_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    encrypted_token: Mapped[str] = mapped_column(
        Text,
        nullable=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    sharing_request: Mapped["SharingRequest"] = relationship()


class MovieAccessGrant(Base):
    __tablename__ = "movie_access_grants"

    __table_args__ = (
        UniqueConstraint(
            "sharing_request_id",
            name="uq_movie_access_grants_sharing_request",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    movie_id: Mapped[int] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sharing_request_id: Mapped[int] = mapped_column(
        ForeignKey("sharing_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship()
    movie: Mapped["Movie"] = relationship()
    sharing_request: Mapped["SharingRequest"] = relationship()


class TransferEvent(Base):
    """
    One recorded upload or download.

    These rows power the admin analytics and the personal statistics.
    Nothing is back-filled: history starts on the day tracking was
    deployed, so speeds and durations are never invented.

    The user's and movie's names are copied into the row so the history
    stays readable after an account or movie is removed.
    """

    __tablename__ = "transfer_events"

    __table_args__ = (
        CheckConstraint(
            "kind IN ('upload', 'download')",
            name="ck_transfer_events_kind",
        ),
        CheckConstraint(
            "status IN ('started', 'completed', 'aborted')",
            name="ck_transfer_events_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    # "upload" or "download".
    kind: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    movie_id: Mapped[int | None] = mapped_column(
        ForeignKey("movies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    movie_title: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    # Bytes that actually moved. For an aborted download this is the
    # partial amount that was sent.
    bytes_transferred: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        server_default="0",
        nullable=False,
    )

    # Full size of the movie file at the time of the transfer.
    total_bytes: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        server_default="0",
        nullable=False,
    )

    # NULL when the duration could not be measured.
    duration_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # "completed", "aborted", or "started" (a download link was issued but
    # the transfer itself is not observed; only used when
    # DOWNLOAD_MODE=direct).
    status: Mapped[str] = mapped_column(
        String(12),
        default="completed",
        server_default="completed",
        nullable=False,
    )

    # "dashboard" (older rows may say "qr_scan" from the removed QR feature).
    via: Mapped[str] = mapped_column(
        String(20),
        default="dashboard",
        server_default="dashboard",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

