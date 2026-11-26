import os

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.company import storage_summary
from app.models import User
from app.routers.auth import (
    hash_password,
    verify_password,
    create_access_token,
)

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing from backend/.env")

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    # Employee ID card number OR company email.
    identifier: str = Field(min_length=1, max_length=255)
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    # Optional: the employee ID card number.
    employee_id: str | None = Field(default=None, max_length=30)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


def user_payload(user: User, db: Session | None = None) -> dict:
    data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "employee_id": user.employee_id,
        "role": user.role,
    }
    if db is not None:
        data["storage"] = storage_summary(db, user)
    return data


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    """Create your own account. Everyone starts as a regular user."""

    name = data.name.strip()
    email = str(data.email).strip().lower()
    employee_id = (data.employee_id or "").strip() or None

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email already has an account.",
        )

    if (
        employee_id
        and db.query(User).filter(User.employee_id == employee_id).first()
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That employee ID already has an account.",
        )

    user = User(
        name=name,
        email=email,
        employee_id=employee_id,
        password_hash=hash_password(data.password),
        role="user",
        is_active=True,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the account.",
        )

    return {"message": "Account created.", "user": user_payload(user)}



@router.post("/login")
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    identifier = data.identifier.strip()

    # An employee ID first, then an email address.
    user = (
        db.query(User).filter(User.employee_id == identifier).first()
        or db.query(User).filter(User.email == identifier.lower()).first()
    )

    if user is None or not verify_password(
        data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee ID, email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user_payload(user, db),
    }


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_payload(current_user, db)


@router.post("/change-password")
def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is not correct.",
        )

    current_user.password_hash = hash_password(data.new_password)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not change the password.",
        )

    return {"message": "Password changed."}
