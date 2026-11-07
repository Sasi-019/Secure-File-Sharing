
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers import routes as auth
from app.routers import movies
from app.routers import admin
from app.routers import sharing
from app.routers import stats

load_dotenv()


app = FastAPI(
    title="FileShare API",
    description="Secure File Sharing Platform",
    version="1.0.0",
)


# Allowed browser origins. Override with CORS_ORIGINS in backend/.env
# (comma-separated). The defaults cover the deployed site and local
# Vite development.
DEFAULT_CORS_ORIGINS = (
    "https://movieshare.onrender.com,"
    "http://localhost:5173,"
    "http://127.0.0.1:5173"
)

cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Authentication endpoints
app.include_router(auth.router)

# Movie endpoints
app.include_router(movies.router)

# Admin endpoints
app.include_router(admin.router)

# Movie sharing endpoints
app.include_router(sharing.router)

# Personal statistics endpoints
app.include_router(stats.router)


@app.get("/")
def home():
    return {
        "message": "FileShare backend is running!"
    }


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )

