# Enyalis Runbook

Concise, copy/paste friendly steps for Development and Production deployments.

---
## 1. Development Workflow

### 1.1 Prerequisites
- Node.js 18+ (LTS recommended)
- Git
- (Optional) Local PostgreSQL 15/16 if you want persistent users

### 1.2 Clone & Install
```
git clone <your-repo-url>
cd Enyalis
npm install
```

### 1.3 Environment Files
Already present:
- `.env` (development) – editable
- `.env.example` – reference

If you want in-memory only (no DB persistence):
```
USE_DB=false
```
If you want local Postgres persistence, ensure `.env` contains:
```
USE_DB=true
DB_HOST=localhost
DB_PORT=5432
DB_USER=enyalis
DB_PASSWORD=enyalis_password
DB_NAME=enyalis_db
```

### 1.4 (Optional) Create Local Postgres User/DB
Using psql (installed with Postgres):
```
psql -U postgres -h localhost -c "CREATE USER enyalis WITH PASSWORD 'enyalis_password';"
psql -U postgres -h localhost -c "CREATE DATABASE enyalis_db OWNER enyalis;"
```
(If you get auth errors, supply `-W` to prompt for the postgres superuser password.)

### 1.5 Run the Server
Development (auto-restart with nodemon):
```
npm run dev
```
Plain start (no watcher):
```
npm start
```

### 1.6 Verify
Open: http://localhost:3000/
Register a user; restart the server:
- If `USE_DB=true` and Postgres running: user persists.
- If `USE_DB=false` or DB unreachable: user is lost on restart (in-memory).

### 1.7 Logs / Troubleshooting
- ECONNREFUSED during startup: Postgres not running (or set `USE_DB=false`).
- JWT errors: Ensure `JWT_SECRET` set in `.env`.
- Port conflicts: Change `PORT` in `.env`.

### 1.8 Useful Commands
List users (DB mode):
```
psql -U enyalis -d enyalis_db -c "SELECT id, username, created_at FROM users;"
```

### 1.9 Resetting (Dev)
To wipe DB data (dangerous): drop and recreate database:
```
psql -U postgres -h localhost -c "DROP DATABASE enyalis_db;"
psql -U postgres -h localhost -c "CREATE DATABASE enyalis_db OWNER enyalis;"
```

---
## 2. Production (Docker Compose) Deployment

### 2.1 Prerequisites
- Docker Engine + Docker Compose plugin (v2) on target host
- A strong secret for JWT
- Firewall allowing inbound TCP/3000 (or your chosen port)

### 2.2 Create Production Env File
Create `.env.production` (never commit real secrets):
```
PORT=3000
NODE_ENV=production
JWT_SECRET=change_this_to_strong_random
USE_DB=true
REQUIRE_DB=true
DB_HOST=postgres
DB_PORT=5432
DB_USER=enyalis
DB_PASSWORD=change_me_secure
DB_NAME=enyalis_db
```

### 2.3 Bring Up Stack
```
docker compose --env-file .env.production --profile prod up -d --build
```
The `--profile prod` flag ensures only production services run.

### 2.4 Check Health & Logs
```
docker compose --profile prod ps
# View logs for app
docker compose --profile prod logs -f app
# View Postgres logs
docker compose --profile prod logs -f postgres
```
Look for: `Server running on port 3000` and `[DB] Users table ensured`.

### 2.5 Verify App
From a browser:
```
http://<server-host>:3000/
```
Register a user, refresh page, ensure persistence.

### 2.6 Basic Database Inspection
```
docker compose --profile prod exec postgres psql -U enyalis -d enyalis_db -c "SELECT id, username FROM users;"
```

### 2.7 Upgrading the App
```
git pull
docker compose --env-file .env.production --profile prod build app
docker compose --env-file .env.production --profile prod up -d
```
(Volume `pgdata` preserves database.)

### 2.8 Backups (Manual Quick Dump)
```
docker compose --profile prod exec postgres pg_dump -U enyalis -d enyalis_db > backup_$(date +%F).sql
```
Automate via cron or a host-level scheduled task.

### 2.9 Stopping / Removing
```
docker compose --profile prod down
# Keeping volume:
docker volume ls | findstr pgdata
# Remove volume (DESTROYS DATA):
docker compose --profile prod down -v
```

### 2.10 Hardening Suggestions
| Area | Action |
|------|--------|
| Secrets | Rotate `JWT_SECRET` regularly; store outside Git |
| DB Exposure | Keep Postgres port un-published (no host mapping) |
| Logging | Add log rotation (Docker handles basic) |
| Migrations | Introduce a migration tool before schema grows |
| Monitoring | Add health endpoint + uptime checks |
| Backups | Schedule daily pg_dump + off-host copy |

### 2.11 Adding Schema Migrations (Future)
- Install a tool (e.g. `npm i -D node-pg-migrate`).
- Add `npm run migrate` script.
- Uncomment the `command` in `docker-compose.yml` to run migrations before starting.

---
## 3. Environment Flag Reference
| Variable | Dev | Prod | Description |
|----------|-----|------|-------------|
| PORT | 3000 | 3000 | HTTP port |
| JWT_SECRET | simple string | strong secret | JWT signing key |
| USE_DB | true/false | true | Enable database layer |
| REQUIRE_DB | false | true | Fail-fast if DB unreachable |
| DB_HOST | localhost | postgres | Host/IP of Postgres service |
| DB_USER | enyalis | enyalis | DB role |
| DB_PASSWORD | enyalis_password | strong password | DB password |
| DB_NAME | enyalis_db | enyalis_db | Database name |

---
## 4. Quick Triage Checklist
| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| 401 on login | JWT mismatch / invalid creds | Re-register or check JWT_SECRET consistency |
| ECONNREFUSED start | Postgres not running | Start Postgres / set USE_DB=false |
| Users vanish after restart | In-memory mode | Ensure USE_DB=true & Postgres OK |
| Container restarts repeatedly | DB health not passing | `docker compose logs postgres` |

---
## 5. Future Enhancements
- Add migrations & seed data.
- Persist channels/messages in DB.
- Introduce role/permission tables.
- Add CDN or object storage for uploads.
- Implement structured logging (pino/winston).
- Add metrics endpoint (Prometheus format) for observability.

---
## 6. Support Commands (Copy/Paste)
Rebuild app only:
```
docker compose --env-file .env.production --profile prod build app
```
Tail logs (follow):
```
docker compose --profile prod logs -f app
```
Database shell:
```
docker compose --profile prod exec postgres psql -U enyalis -d enyalis_db
```

---
If you need this split into two separate files instead (DEV-RUN.md / PROD-RUN.md), let me know and I can generate them.
