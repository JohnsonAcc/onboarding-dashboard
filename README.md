# Onboarding Checkpoints System

Dynamic onboarding guide with 7 phases, public progress tracking, and an admin page for editing checklist content and managing files.

## Run

From the project root (`webapp`) run the server using Python or the npm script.

Windows (PowerShell or Command Prompt):

```powershell
python server.py
```

Or via npm:

```bash
npm start
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

To use different admin credentials without editing `data/onboarding.json`, set environment variables before starting.

Windows PowerShell:

```powershell
$env:ADMIN_EMAIL = "your.email@company.com"
$env:ADMIN_PASSWORD = "your-password"
python server.py
```

Windows CMD:

```cmd
set ADMIN_EMAIL=your.email@company.com && set ADMIN_PASSWORD=your-password && python server.py
```

macOS / Linux (optional):

```bash
ADMIN_EMAIL=your.email@company.com ADMIN_PASSWORD=your-password python3 server.py
```

## Data and Files

- Shared onboarding content is stored in `data/onboarding.json`.
- Admin uploads are stored in `uploads/`.
- Public checklist progress is stored per user in their browser localStorage.
