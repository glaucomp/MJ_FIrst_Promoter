# Deploy & Version Guide

How to bump the app version and deploy so the dashboard shows the correct release.

---

## How versioning works

| What | Where |
|------|--------|
| **Source of truth** | `"version"` in root `package.json` |
| **Frontend** | Injected at build time via Vite (`frontend/vite.config.ts`) |
| **Backend** | Read at runtime from root `package.json` (`src/lib/version.ts`) |
| **Dashboard UI** | Top bar, next to your role — e.g. `Admin · v1.0.0` |
| **Health check** | `GET /health` returns `{ "status": "ok", "version": "1.0.0", ... }` |

Always bump the version **before** you build and deploy.

---

## Bump the version (local)

Run these from the **project root** (not inside `frontend/`).

### Patch — bug fixes, small changes

`1.0.0` → `1.0.1`

```bash
npm run version:patch
```

### Minor — new features, no breaking changes

`1.0.0` → `1.1.0`

```bash
npm run version:minor
```

### Major — breaking or large releases

`1.0.0` → `2.0.0`

```bash
npm run version:major
```

Each command:

1. Updates root `package.json`
2. Syncs `frontend/package.json` via `scripts/sync-version.js`

### Manual bump

Edit `"version"` in root `package.json`, then:

```bash
npm run version:sync
```

### Commit the version change

```bash
git add package.json frontend/package.json
git commit -m "Bump version to X.Y.Z"
git push
```

---

## Deploy to production (AWS)

Typical flow after bumping the version:

```bash
# 1. On your machine — bump version (see above), commit, push

# 2. On the server
cd /home/ubuntu/MJ_FIrst_Promoter
git pull origin <your-branch>

npm install
npm run build

pm2 restart all
```

See also: [AWS_DEPLOYMENT_CMD.md](./AWS_DEPLOYMENT_CMD.md) and [AWS_UBUNTU_DEPLOYMENT.md](./AWS_UBUNTU_DEPLOYMENT.md).

**Important:** Run `npm run build` after pulling. The version in the UI is baked into the frontend at build time. Restarting PM2 alone without a new build will not update the displayed version.

---

## Verify after deploy

### Dashboard

Log in and check the top bar profile area:

`Admin User` → `Admin · v1.0.1`

### Health endpoint

```bash
curl https://your-domain.com/health
```

Expected:

```json
{
  "status": "ok",
  "version": "1.0.1",
  "timestamp": "..."
}
```

### Server logs

On startup, the backend logs:

```text
📦 App version: 1.0.1
```

---

## Semver quick reference

| Change type | Command | Example |
|-------------|---------|---------|
| Bug fix | `npm run version:patch` | `1.0.0` → `1.0.1` |
| New feature | `npm run version:minor` | `1.0.0` → `1.1.0` |
| Breaking change | `npm run version:major` | `1.0.0` → `2.0.0` |

---

## Troubleshooting

**UI still shows the old version**

- You did not run `npm run build` after bumping.
- Browser cache — hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`).
- Server is running old code — confirm `git pull` and `pm2 restart all`.

**Root and frontend versions out of sync**

```bash
npm run version:sync
```

**Override version without changing package.json** (rare)

Set on the server:

```bash
APP_VERSION=1.0.1
```

This affects the backend `/health` response only. The dashboard UI still uses the version from the frontend build.
