"""
Requesting access to a file and approving or declining requests.

How sharing works:
  1. A user asks the owner for access to a file ("Request Access").
  2. The owner accepts or declines in their notifications.
  3. Once accepted, the requester's button becomes "Download file".

There are no QR codes and no expiring grants: an accepted request is what
allows the download (see movies.py). Everyone, including administrators,
needs an accepted request to download a file they do not own.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Movie, Notification, SharingRequest, User
from app.routers.routes import get_current_user

router = APIRouter(prefix="/sharing", tags=["File Sharing"])


@router.post(
    "/movies/{movie_id}/request",
    status_code=status.HTTP_201_CREATED,
)
def request_movie_access(
    movie_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Request access to another user's file.

    Creates a pending sharing request and notifies
    the file owner.
    """

    # 1. Check that the file exists.
    movie = (
        db.query(Movie)
        .filter(Movie.id == movie_id)
        .first()
    )

    if movie is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found.",
        )

    # 2. Prevent users from requesting their own movies.
    if movie.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot request access to your own file.",
        )

    # 3. Check that the owner exists and is active.
    owner = (
        db.query(User)
        .filter(User.id == movie.owner_id)
        .first()
    )

    if owner is None or not owner.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This file's owner is not available.",
        )

    # 4. Prevent duplicate requests.
    existing_request = (
        db.query(SharingRequest)
        .filter(
            SharingRequest.movie_id == movie.id,
            SharingRequest.requester_id == current_user.id,
        )
        .first()
    )

    if existing_request is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You have already requested access to this file. "
                f"Current status: {existing_request.status}."
            ),
        )

    # 5. Create the sharing request.
    sharing_request = SharingRequest(
        movie_id=movie.id,
        requester_id=current_user.id,
        owner_id=owner.id,
        status="pending",
    )

    try:
        db.add(sharing_request)
        db.flush()

        # 6. Notify the file owner.
        notification = Notification(
            user_id=owner.id,
            sharing_request_id=sharing_request.id,
            type="sharing_request",
            message=(
                f"{current_user.name} requested access "
                f"to your file '{movie.title}'."
            ),
            is_read=False,
        )

        db.add(notification)
        db.commit()
        db.refresh(sharing_request)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the sharing request.",
        )

    return {
        "message": "File access request sent successfully.",
        "request": {
            "id": sharing_request.id,
            "movie_id": sharing_request.movie_id,
            "movie_title": movie.title,
            "requester_id": sharing_request.requester_id,
            "owner_id": sharing_request.owner_id,
            "status": sharing_request.status,
            "created_at": sharing_request.created_at,
        },
    }

@router.patch("/requests/{request_id}/decision")
def decide_sharing_request(
    request_id: int,
    decision: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only accept or reject are valid decisions.
    decision = decision.lower().strip()

    if decision not in ["accepted", "rejected"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be 'accepted' or 'rejected'.",
        )

    # Find the sharing request.
    sharing_request = (
        db.query(SharingRequest)
        .filter(SharingRequest.id == request_id)
        .first()
    )

    if sharing_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sharing request not found.",
        )

    # Only the movie owner can decide.
    if sharing_request.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the file owner can decide this request.",
        )

    # Do not allow a request to be decided more than once.
    if sharing_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request has already been {sharing_request.status}.",
        )

    # Verify that the requester is still active.
    requester = (
        db.query(User)
        .filter(User.id == sharing_request.requester_id)
        .first()
    )

    if requester is None or not requester.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The requester is no longer active.",
        )

    # Update the request.
    sharing_request.status = decision

    # Create a notification for the requester.
    movie = db.query(Movie).filter(
        Movie.id == sharing_request.movie_id
    ).first()

    movie_title = movie.title if movie else "the file"

    notification = Notification(
        user_id=requester.id,
        sharing_request_id=sharing_request.id,
        type=f"sharing_request_{decision}",
        message=(
            f"Your request to access '{movie_title}' "
            f"has been {decision}."
        ),
        is_read=False,
    )

    try:
        db.add(notification)
        db.commit()
        db.refresh(sharing_request)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the sharing request.",
        )

    return {
        "message": f"Sharing request {decision} successfully.",
        "request": {
            "id": sharing_request.id,
            "movie_id": sharing_request.movie_id,
            "requester_id": sharing_request.requester_id,
            "owner_id": sharing_request.owner_id,
            "status": sharing_request.status,
            "updated_at": sharing_request.updated_at,
        },
    }

@router.get("/notifications")
def get_sharing_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )

    results = []

    for notification in notifications:
        item = {
            "id": notification.id,
            "type": notification.type,
            "message": notification.message,
            "sharing_request_id": notification.sharing_request_id,
            "is_read": notification.is_read,
            "created_at": (
                notification.created_at.isoformat()
                if notification.created_at
                else None
            ),
            "decision": None,
            "owner_id": None,
            "requester_id": None,
            "movie_id": None,
            "movie_title": None,
        }

        if notification.sharing_request_id is not None:
            sharing_request = (
                db.query(SharingRequest)
                .filter(
                    SharingRequest.id == notification.sharing_request_id
                )
                .first()
            )

            if sharing_request:
                item["decision"] = sharing_request.status
                item["owner_id"] = sharing_request.owner_id
                item["requester_id"] = sharing_request.requester_id
                item["movie_id"] = sharing_request.movie_id

                movie = (
                    db.query(Movie)
                    .filter(Movie.id == sharing_request.movie_id)
                    .first()
                )

                if movie:
                    item["movie_title"] = movie.title

        results.append(item)

    return {"notifications": results}

@router.patch("/notifications/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    notification.is_read = True

    try:
        db.commit()
        db.refresh(notification)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not mark notification as read.",
        )

    return {
        "message": "Notification marked as read.",
        "notification": {
            "id": notification.id,
            "is_read": notification.is_read,
        },
    }
