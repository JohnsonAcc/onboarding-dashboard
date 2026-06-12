# Onboarding Checkpoints System

Dynamic onboarding guide with 8 phases, public progress tracking, and an admin page for editing checklist content and managing files.

## Run

```bash
python3 server.py
```

Open:

- Public guide: http://localhost:3000/
- Admin guide: http://localhost:3000/admin

## Admin Login

Default admin credentials:

```text
Email: example@accenture.com
Password: 1234
```

To use different credentials without editing data, start the server like this:

```bash
ADMIN_EMAIL=your.email@company.com ADMIN_PASSWORD=your-password python3 server.py
```

## Data and Files

- Shared onboarding content is stored in `data/onboarding.json`.
- Admin uploads are stored in `uploads/`.
- Public checklist progress is stored per user in their browser localStorage.
