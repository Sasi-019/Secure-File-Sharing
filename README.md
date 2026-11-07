<<<<<<< HEAD
FileShare — Secure Cloud File Sharing Platform

FileShare is a full-stack web app where signed-in users upload files to a private cloud bucket and share them through an owner-approved access request flow. Nobody downloads another user's file without the owner's explicit approval, and that includes administrators. Every upload and download is measured, so admins (and each user, for their own activity) get real usage graphs.

Backend: FastAPI + SQLAlchemy + PostgreSQL, files stored in a private Backblaze B2 bucket (S3-compatible API)
Frontend: React + Vite + Tailwind CSS
Features

Accounts and authentication

Register and log in with email and password (minimum 8 characters).
Passwords are hashed with pwdlib using its recommended settings (Argon2).
Stateless login with JWT bearer tokens (HS256, default lifetime 60 minutes, configurable).
Blocked (inactive) accounts are rejected on every authenticated request.

Uploading and browsing

Upload any file type up to 100 MB with a title and optional description.
Executable and script formats are rejected: .exe .msi .bat .cmd .com .scr .pif .vbs .vbe .ps1 .jar .apk .dll .lnk.
Files are stored under a random UUID key; the real storage key is never returned by the API.
Every signed-in user can browse the whole library and search by title or description (up to 50 results).

Permission-based sharing

A user clicks Request Access on someone else's file.
The owner gets a notification and accepts or rejects it.
Once accepted, the requester's button becomes Download file.

Rules enforced on the server:

You cannot request your own file, and you can only have one request per file.
Only the file's owner can decide a request, and a request can only be decided once.
Only the owner or an accepted requester can download. Admins get no special download access.
The dashboard polls notifications every 4 seconds, so an accepted request shows up without a page reload.

Secure, measured downloads

GET /movies/{id}/download runs the permission checks and returns a signed download ticket valid for 10 minutes.
The ticket URL streams the file through the backend (256 KB chunks) instead of redirecting to the bucket, so the private storage location is never exposed.
Responses are sent as application/octet-stream with Content-Disposition: attachment, nosniff and no-store headers, so browsers save the file instead of opening it.
Each download is recorded as completed or aborted (with the partial byte count).

Deleting

Only the owner can delete a file. Deletion removes every stored version of the object in Backblaze (buckets keep old versions by default), then removes the database record and its access requests.

Statistics and administration

Personal stats for every user: uploads, downloads, average upload/download speed and a 14-day activity chart.
Admin dashboard: total users, total files, storage used, and time-series charts (daily / weekly / monthly) for transfers, bytes moved, speed, duration, storage growth and active users.
Admin tools: most active users, download history, and block / unblock users.
Analytics only use recorded events. Periods with no data show as zeros or gaps, never estimated values.
Tech stack
Layer Technology
API FastAPI, Uvicorn, Pydantic
Database PostgreSQL (psycopg 3), SQLAlchemy 2, Alembic
Auth PyJWT, pwdlib (Argon2)
File storage Backblaze B2 through boto3 (S3-compatible, private bucket)
Frontend React 19, Vite, Tailwind CSS 4, Axios

PostgreSQL is required: the analytics queries use date_trunc and timezone.

Project structure
Secure-File-Sharing/
├── backend/
│ ├── app/
│ │ ├── main.py # FastAPI app, CORS, router registration, /health
│ │ ├── database.py # Engine, session, Base, get_db dependency
│ │ ├── models.py # User, Movie (file), SharingRequest, Notification, TransferEvent, ...
│ │ ├── security.py # Password hashing and JWT creation
│ │ ├── storage.py # Backblaze B2 client and connection check
│ │ ├── transfers.py # Download tickets, measured streaming, event recording
│ │ ├── analytics.py # Pure helpers for time buckets, speeds, averages
│ │ ├── sqlhelpers.py # SQL helpers for UTC date buckets
│ │ └── routers/
│ │ ├── routes.py # /auth: register, login, me (+ get_current_user)
│ │ ├── movies.py # /movies: upload, list, search, download, delete
│ │ ├── sharing.py # /sharing: access requests and notifications
│ │ ├── admin.py # /admin: dashboard, users, analytics, history
│ │ └── stats.py # /stats/me: personal statistics
│ ├── alembic/ # Database migrations
│ ├── create_tables.py # Create all tables directly from the models
│ ├── make_admin.py # CLI to promote a registered user to admin
│ ├── test_storage.py # CLI check that B2 credentials work
│ ├── requirements.txt
│ └── .env.example
└── frontend/
├── src/
│ ├── App.jsx # Session handling and app-level state
│ ├── services/api.js # Axios client and all API calls
│ ├── pages/ # LoginPage, DashboardPage, AdminDashboard
│ └── components/ # UploadForm, MovieCard, ManageUsers, AdminAnalytics, PersonalStats, charts/
├── package.json
└── vite.config.js
Getting started
Prerequisites
Python 3.10+ (the code uses X | None type syntax)
Node.js 20.19+ (or 22.12+) and npm, as required by Vite 8
A PostgreSQL database
A private Backblaze B2 bucket and an application key with access to it

1. Backend
   bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env # then edit .env (see below)

Fill in backend/.env:

Variable Required Description
DATABASE_URL yes e.g. postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
JWT_SECRET_KEY yes Long random string. Generate one with python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_ACCESS_TOKEN_MINUTES no Login token lifetime, default 60
B2_KEY_ID yes Backblaze application key ID
B2_APPLICATION_KEY yes Backblaze application key
B2_BUCKET_NAME yes Name of your private bucket
B2_ENDPOINT_URL yes e.g. https://s3.us-east-005.backblazeb2.com
CORS_ORIGINS no Comma-separated allowed frontend origins (defaults include http://localhost:5173)

The app refuses to start if DATABASE_URL, JWT_SECRET_KEY or any of the B2 variables are missing.

Create the database tables, then check the storage connection:

bash
python create_tables.py # or: alembic upgrade head
python test_storage.py # should print "SUCCESS: FileShare connected to Backblaze B2!"

Start the API:

bash
uvicorn app.main:app --reload

The API runs at http://127.0.0.1:8000. Interactive docs are at /docs and a health check at /health.

The B2 client is created with region us-east-005. If your bucket is in another region, update region_name in app/storage.py and app/routers/movies.py along with B2_ENDPOINT_URL.

2. Create an administrator

Registration always creates a regular user. Register an account in the app first, then promote it:

bash
cd backend
python make_admin.py

Enter the account's email and type YES to confirm. On the login page, choose the Admin role to sign in with that account; the login form checks that the selected role matches the account's actual role.

3. Frontend
   bash
   cd frontend
   npm install
   npm run dev

The app runs at http://localhost:5173 and talks to http://127.0.0.1:8000 by default. To point it at another API, create frontend/.env:

VITE_API_URL=https://your-api-host

Other scripts: npm run build (production build into dist/), npm run preview, npm run lint.

API overview

All endpoints except register and login need an Authorization: Bearer <token> header. The signed download URL is the one exception, because it carries its own short-lived ticket.

Method Endpoint Access Purpose
POST /auth/register public Create an account
POST /auth/login public Get an access token
GET /auth/me user Current user
POST /movies/upload user Upload a file (multipart: title, description, file)
GET /movies/ user List all files with uploader and your request status
GET /movies/search?q= user Search by title or description
GET /movies/{id}/download owner / accepted requester Get a 10-minute signed download path
GET /movies/download/{ticket} valid ticket Stream the file and record the transfer
POST /movies/{id}/upload-timing uploader Attach browser-measured upload duration
DELETE /movies/{id} owner Permanently delete a file
POST /sharing/movies/{id}/request user Request access to a file
PATCH /sharing/requests/{id}/decision?decision=accepted|rejected file owner Decide a request
GET /sharing/notifications user Your notifications
PATCH /sharing/notifications/{id}/read user Mark a notification read
GET /stats/me user Your own upload/download statistics
GET /admin/dashboard admin Totals: users, files, storage
GET /admin/users admin All users with file counts and storage
PATCH /admin/users/{id}/block · /unblock admin Block or unblock a regular user
GET /admin/analytics?period=day|week|month admin Time-series for the charts
GET /admin/user-activity admin Most active users
GET /admin/downloads admin Download history (paginated)
Security model
Private storage. The bucket is never public. Files are only reachable through the backend after permission checks pass.
No storage key leakage. The API returns file metadata only; the storage key stays server-side.
Short-lived signed tickets. Download links are JWTs scoped to one user and one file, expiring after 10 minutes.
Owner-controlled access. Access is granted per file, per requester, by the owner only.
Safe downloads. Forced attachment downloads with nosniff and no-store headers.
Blocked account checks. Inactive users cannot log in, use an existing token, or download via a ticket.
=======

>>>>>>> 6a76c03915f343f06770148e50e2843080ae7985
