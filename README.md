# FileShare — a private file portal for a company

FileShare is a company file portal with a simple login: pick **User Login**
or **Admin Login**, then email and password (users can also register). Every employee has a personal drive in the cloud with
files filed automatically into folders (Images, Videos, PDFs, Documents,
Audio, Archives, Other). Each file is **private**, shared with **chosen
colleagues**, or **public** (every employee can download it). A bell tells
people about new public files, announcements, shared files and messages.
While a file uploads or downloads, the page shows the live transfer speed, and
the administrator sees average upload and download speed graphs.

## Features

**For every employee**
- **User Login** with email and password, or **Register** a new account.
  Change your password from the header.
- Upload any file up to 100 MB with a title, a description and a setting:
  - 🔒 **Private** (default) — only the owner can see and download it.
  - 👥 **Chosen people** — only the colleagues you pick (one, two, three or
    more) can download it. A search box and name cards make picking easy.
  - 🌐 **Public** — every signed-in employee, administrators included, can
    download it, and everyone is notified.
- Change a file between private, chosen people and public at any time
  (**Who can see it**), or delete your own files (the data is removed from
  cloud storage, including old versions).
- Drive view with tabs **My files**, **Shared with me** and **Public files**,
  folder chips with counts, and search.
- **Notification bell** with an unread count: new public files, administrator
  announcements (shown at the top of Public files), files shared with you and
  messages.
- **Messages:** send a message to one or several colleagues at once (use
  "Select all shown" in the picker), or to the administrator, optionally with one
  of your files. Only the chosen people can download the file.
- **Storage allowance:** a bar shows how much of your space you have used.
- **Live transfer card** on every upload and download: a small card at the
  bottom right shows the speed and a live graph, and closes by itself shortly
  after the transfer finishes. Downloads can be cancelled. Personal statistics show your own speeds and activity.

**For the administrator**
- Add employees (name, employee ID, company email, first password, optional
  storage in MB), change anyone's storage allowance, block and unblock people.
- Platform overview, average **upload speed** and **download speed** graphs
  (daily, weekly or monthly), transfer volume, storage over time, active users
  and download history. Private and shared files are never opened: their names
  are hidden in the history, and the administrator cannot see or download them
  unless someone sends them a file or message.
- Posting a file as public from the administrator account shows it to every
  employee as an announcement.

## How access works

| File is… | Owner | Chosen colleague | Any other employee | Administrator (not the owner) |
|---|---|---|---|---|
| Private | see, download, delete, change setting | — | cannot see it | cannot see it |
| Chosen people | see, download, delete, change setting | see and download | cannot see it | cannot see it |
| Public | see, download, delete, change setting | see and download | see and download | see and download |

Only the owner can delete a file or change who can see it. Files of a blocked
employee cannot be downloaded. Sending a file with a message to the
administrator shares that file with the administrator only.

## Tech stack

- **Backend:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL
- **Storage:** Backblaze B2 (S3-compatible API, private bucket)
- **Frontend:** React 19, Vite, Tailwind CSS, axios (charts are plain SVG)

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, routers
    models.py          database tables
    categories.py      file type -> folder (Images, Videos, ...)
    company.py         storage allowance, notifications, who a file is shared with
    transfers.py       signed download links + measured streaming
    analytics.py       time buckets and speed maths for the graphs
    routers/
      routes.py        login (ID or email), current user, change password
      social.py        people picker, notifications, messages
      movies.py        upload, list, search, download, delete, visibility
      stats.py         a user's own statistics
      admin.py         platform overview, analytics, users, download history
  alembic/             database migrations
  make_admin.py        promote a registered account to administrator
  create_admin.py      alternative: create an administrator directly
frontend/
  src/
    App.jsx            state, uploads, downloads, live transfer tracking
    pages/             DashboardPage, AdminDashboard, LoginPage
    components/        MovieCard, UploadForm, TransferPanel, AdminAnalytics, ...
    services/          api.js (server calls), rate.js (live speed maths)
```

## Setup

You need Python 3.11+, Node.js (LTS), PostgreSQL (an empty database) and a
Backblaze B2 **private** bucket with an application key.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env      # then edit .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

`backend/.env`:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | e.g. `postgresql+psycopg://user:password@localhost:5432/fileshare` |
| `JWT_SECRET_KEY` | long random string (at least 32 characters) |
| `JWT_ACCESS_TOKEN_MINUTES` | login lifetime |
| `B2_KEY_ID`, `B2_APPLICATION_KEY` | Backblaze application key |
| `B2_BUCKET_NAME`, `B2_ENDPOINT_URL` | your bucket and its S3 endpoint |
| `DEFAULT_QUOTA_MB` | storage each employee gets by default (500 if not set) |
| `CORS_ORIGINS` | optional, comma-separated frontend addresses |

Never commit `.env` or share it.

Make yourself the administrator: **Register** in the app first, then run this
in the `backend` folder and enter that email:

```powershell
python make_admin.py
```

Then use **Admin Login**. The administrator can also add employees (with an
employee ID and a storage allowance) from the dashboard.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The frontend talks to `http://127.0.0.1:8000` by
default; set `VITE_API_URL` in `frontend/.env` to point somewhere else.

## Upgrading from the earlier drive version

`alembic upgrade head` adds employee IDs, storage allowances, the *chosen
people* setting, and the tables for shares and messages. Existing accounts keep
working: sign in with the email until the administrator gives that person an
employee ID. Existing files keep their setting (private or public). The old
tables for access requests and QR codes are unused but left in place.

## API overview

| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` | anyone / signed in | register and sign in |
| `POST /movies/upload` | signed in | upload (title, description, visibility, recipients, file) |
| `GET /movies/` | signed in | your files, files shared with you, others' public files |
| `GET /movies/search?q=` | signed in | search those files |
| `GET /movies/{id}/download` | owner, chosen people, or anyone for public files | short-lived signed download link |
| `GET /movies/download/{ticket}` | holder of the link | streams the file and records the transfer |
| `PATCH /movies/{id}/visibility` | owner | private, shared (with `recipients`) or public |
| `DELETE /movies/{id}` | owner | delete the file for good |
| `POST /movies/{id}/upload-timing` | uploader | report the upload's send time |
| `GET /stats/me` | signed in | your own statistics |
| `GET /admin/dashboard`, `/admin/analytics?period=`, `/admin/user-activity`, `/admin/downloads`, `/admin/users` | admin | platform analytics |
| `POST /admin/users` | admin | add an employee |
| `PATCH /admin/users/{id}/quota`, `/block`, `/unblock` | admin | storage allowance, access |
| `GET /people?q=` | signed in | colleagues to share with |
| `GET /notifications`, `POST /notifications/read-all`, `PATCH /notifications/{id}/read` | signed in | the bell |
| `POST /messages`, `GET /messages?box=inbox\|sent`, `PATCH /messages/{id}/read` | signed in | messages to one or many people (`recipient_ids` list) |

Interactive documentation is at http://localhost:8000/docs.

## Notes and limits

- Uploads are limited to 100 MB per file and by each person's storage allowance; programs (`.exe`, `.bat`, `.msi`, ...) are refused.
- Upload speed is measured in the browser up to the moment the last byte is sent;
  the short wait while the server saves the file to cloud storage is not counted.
- Speeds and durations are recorded from the day tracking started; earlier
  activity is never estimated.
- Only upload files you own or have permission to share.
