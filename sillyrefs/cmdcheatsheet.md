---

### Local Development Quick-Reference
---
:LivePreview start

### 1. Next.js App Control

| Command | Purpose | When to Use |
| --- | --- | --- |
| `pnpm dev` | Boots up the local development web server. | Standard day-to-day coding. Runs UI on `http://localhost:3000`. |
| `pnpm run nuke` | Wipes caches, re-installs dependencies, and regenerates Prisma types. | Use this if the project compiler or dependencies get corrupted. |
| `rm -rf .next` | Wipes the Next.js local compiler cache. | Fixes internal bundler/manifest crashes. |

---

### 2. Prisma ORM Workflow

Always remember to restart your editor LSP (`:LspRestart` in Neovim) after running schema updates so type autocomplete matches your new database shape.

```bash
# Update the local database schema to match modifications made to schema.prisma
pnpm prisma db push

# Re-run the data injection script to completely reset and populate tables
pnpm prisma db seed

# Rebuild the type definitions inside node_modules (runs automatically on db push)
pnpm prisma generate

# Spin up the native browser-based database viewer (Defaults to port 5555)
pnpm prisma studio

```

---

### 3. Docker Container Management

If database connection strings throw timeout or authentication issues, verify your Docker daemon status using the commands below.

```bash
# List all containers on your system to see if the database is running
docker ps -a

# Start the local PostgreSQL instance
docker start racs2-postgres

# Stop the database container to free up memory/system resources
docker stop racs2-postgres

```

---

### 4. System & Port Debugging (macOS)

Use these to track down conflicting ports if your development server or database fails to bind because an old process is stuck running in the background.

```bash
# Check if a process is holding onto the web server port
lsof -i :3000

# Check if a process is holding onto the Prisma Studio port
lsof -i :5555

# Check if a process is holding onto the Postgres database port
lsof -i :5432

# Forcefully terminate a stuck background process (Replace 1234 with the PID from lsof)
kill -9 1234

```
