# Interview-System

Full-stack interview scheduling and feedback system.

## Features
- Admin and student authentication (JWT)
- CSV onboarding of students with hashed passwords (must change on first login)
- Event management with template upload and notifications
- Student event join with acknowledgment
- One-way unique pairing (no reciprocal pairs), odd student handling
- Scheduling with proposed slots, confirmation, meeting link
- Reminders (1 day / 1 hour) via cron
- Feedback collection and admin CSV export

## Setup

1. Backend
- Copy `backend/.env.example` to `backend/.env` and set values (MongoDB, admin credentials, SMTP optional).
- Install deps and run:

```powershell
cd backend; npm install; npm run dev
```

API runs on http://localhost:4000.

2. Frontend
- Create `.env` in `frontend` (optional):

```
VITE_API_BASE=http://localhost:4000/api
```

- Install deps and run:

```powershell
cd frontend; npm install; npm run dev
```

UI runs on http://localhost:5173.

## Notes
- Reminder jobs run every 5 minutes; ensure server stays running.
- File uploads are stored to `uploads/`.
- Pairing generation replaces existing pairs per event.
