"""
People directory, notifications (the bell) and one-to-one messages.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.company import notify, shared_with
from app.database import get_db
from app.models import FileShare, Message, Movie, Notification, User
from app.routers.routes import get_current_user

router = APIRouter(tags=["People and messages"])


# --------------------------------------------------
# PEOPLE (for the "share with" picker)
# --------------------------------------------------

def person_card(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "employee_id": user.employee_id,
    }


@router.get("/people")
def list_people(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The colleagues you can share with: every active employee except you and
    the administrator, filtered by name or employee ID. The administrator is
    returned separately, for "Message admin".
    """

    needle = q.strip().lower()

    people = []
    admins = []

    for user in (
        db.query(User)
        .filter(User.is_active.is_(True))
        .all()
    ):
        if user.id == current_user.id:
            continue

        if user.role == "admin":
            admins.append(person_card(user))
            continue

        if needle and needle not in (
            f"{user.name} {user.employee_id or ''}".lower()
        ):
            continue

        people.append(person_card(user))

    people.sort(key=lambda p: p["name"].lower())

    return {"people": people, "admins": admins}


# --------------------------------------------------
# NOTIFICATIONS (the bell)
# --------------------------------------------------

def serialize_notification(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "message": n.message,
        "movie_id": n.movie_id,
        "is_read": bool(n.is_read),
        "created_at": n.created_at,
    }


@router.get("/notifications")
def my_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )

    unread = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    return {
        "unread": unread,
        "notifications": [serialize_notification(n) for n in rows],
    }


@router.post("/notifications/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .all()
    )

    for n in rows:
        n.is_read = True

    db.commit()

    return {"marked": len(rows)}


@router.patch("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )

    if n is None:
        raise HTTPException(status_code=404, detail="Notification not found.")

    n.is_read = True
    db.commit()

    return {"id": n.id, "is_read": True}


# --------------------------------------------------
# MESSAGES (one to one, optionally with a file)
# --------------------------------------------------

class NewMessage(BaseModel):
    # One person or several: everyone gets their own copy.
    recipient_ids: list[int] = Field(min_length=1, max_length=50)
    body: str = Field(min_length=1, max_length=2000)
    # One of YOUR files to send with the message. Only the people you
    # choose get access to it.
    movie_id: int | None = None


def serialize_message(db: Session, m: Message, me: User) -> dict:
    other_id = m.recipient_id if m.sender_id == me.id else m.sender_id
    other = db.query(User).filter(User.id == other_id).first()

    attached = None
    if m.movie_id:
        movie = db.query(Movie).filter(Movie.id == m.movie_id).first()
        if movie is not None:
            attached = {
                "id": movie.id,
                "title": movie.title,
                "filename": movie.original_filename,
                "file_size": movie.file_size,
            }

    return {
        "id": m.id,
        "body": m.body,
        "direction": "sent" if m.sender_id == me.id else "received",
        "other": (
            {"id": other.id, "name": other.name, "role": other.role}
            if other is not None
            else None
        ),
        "file": attached,
        "created_at": m.created_at,
        "is_read": m.read_at is not None,
    }


@router.post("/messages", status_code=201)
def send_message(
    data: NewMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to one or several people (the administrator included)."""

    body = data.body.strip()

    if not body:
        raise HTTPException(status_code=400, detail="Write a message first.")

    recipient_ids = []
    for rid in data.recipient_ids:
        if rid not in recipient_ids:
            recipient_ids.append(rid)

    if current_user.id in recipient_ids:
        raise HTTPException(
            status_code=400,
            detail="You cannot send a message to yourself.",
        )

    recipients = []
    for rid in recipient_ids:
        person = db.query(User).filter(User.id == rid).first()

        if person is None or not person.is_active:
            raise HTTPException(
                status_code=400,
                detail="One of the chosen people cannot receive messages.",
            )

        recipients.append(person)

    movie = None

    if data.movie_id is not None:
        movie = (
            db.query(Movie)
            .filter(
                Movie.id == data.movie_id,
                Movie.owner_id == current_user.id,
            )
            .first()
        )

        if movie is None:
            raise HTTPException(
                status_code=404,
                detail="You can only send your own files.",
            )

    messages = []

    try:
        if movie is not None and movie.visibility != "public":
            # A private file becomes shared with just these people; a file
            # already shared with others gains them too.
            already = shared_with(db, movie.id)
            for person in recipients:
                if person.id not in already:
                    db.add(FileShare(movie_id=movie.id, user_id=person.id))
            movie.visibility = "shared"

        text = f"New message from {current_user.name}"
        if movie is not None:
            text += f" with the file '{movie.title}'"

        for person in recipients:
            message = Message(
                sender_id=current_user.id,
                recipient_id=person.id,
                body=body,
                movie_id=movie.id if movie is not None else None,
            )
            db.add(message)
            messages.append(message)

        notify(
            db,
            [p.id for p in recipients],
            "message",
            text + ".",
            movie.id if movie else None,
        )

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not send the message.",
        )

    names = ", ".join(p.name for p in recipients)

    return {
        "message": (
            f"Sent to {names}."
            if len(recipients) <= 3
            else f"Sent to {len(recipients)} people."
        ),
        "count": len(recipients),
        "items": [serialize_message(db, m, current_user) for m in messages],
    }


@router.get("/messages")
def my_messages(
    box: str = Query("inbox"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Your inbox (box=inbox) or the messages you sent (box=sent)."""

    if box not in ("inbox", "sent"):
        raise HTTPException(status_code=400, detail="box must be inbox or sent.")

    if box == "inbox":
        condition = Message.recipient_id == current_user.id
    else:
        condition = Message.sender_id == current_user.id

    rows = (
        db.query(Message)
        .filter(condition)
        .order_by(Message.created_at.desc())
        .limit(100)
        .all()
    )

    return {
        "box": box,
        "messages": [serialize_message(db, m, current_user) for m in rows],
    }


@router.patch("/messages/{message_id}/read")
def read_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = (
        db.query(Message)
        .filter(
            Message.id == message_id,
            Message.recipient_id == current_user.id,
        )
        .first()
    )

    if m is None:
        raise HTTPException(status_code=404, detail="Message not found.")

    if m.read_at is None:
        m.read_at = datetime.now(timezone.utc)
        db.commit()

    return {"id": m.id, "is_read": True}
