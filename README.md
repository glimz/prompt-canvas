# PromptCanvas

Generate consistent AI header images from blog titles using a structured Node.js prompt pipeline, React UI, and Supabase authentication.

## What is implemented
- Node.js + TypeScript backend for prompt generation and image generation
- React + Vite frontend with Supabase login/sign-up flow
- Backend-only OpenAI API usage (API key never exposed to browser)
- Admin dashboard section for logs, system readiness, and app settings
- Runtime branding settings that directly affect prompt generation
- Custom UI theme settings (colors/background) editable in admin
- Preview-first generated image workflow (preview + download controls)
- Audit log stream in `output/audit-log.jsonl`
- Reproducible image metadata in `output/manifest.json`

## Default branding seed
- Default theme + prompt branding are pre-seeded with neutral demo values.
- Branding can be edited in Admin Settings at runtime.

## Project structure

```text
prompt-canvas/
├── src/
│   ├── brand.ts
│   ├── index.ts
│   ├── prompts.ts
│   ├── settings.ts
│   ├── server.ts
│   └── types.ts
├── input/
│   └── blog-titles.json
├── output/
│   ├── images/
│   ├── manifest.json
│   ├── settings.json
│   └── audit-log.jsonl
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── supabase.ts
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── .env.example
├── package.json
└── README.md
```

## Environment setup

### 1. Backend `.env`

```bash
cp .env.example .env
```

Required values:

```env
OPENAI_API_KEY=your_openai_key
APP_NAME=PromptCanvas Demo Studio
COMPANY_NAME=PromptCanvas Demo
IMAGE_PROVIDER=openai
POLLINATIONS_MODEL=flux
OPENAI_TIMEOUT_MS=120000
POLLINATIONS_TIMEOUT_MS=60000
PORT=8787
ALLOWED_ORIGIN=http://localhost:5173
AUTH_ENABLED=true
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
ADMIN_EMAILS=admin1@yourdomain.com,admin2@yourdomain.com
```

### 2. Frontend env

```bash
cp web/.env.example web/.env
```

Set:

```env
VITE_API_BASE=http://localhost:8787
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ALLOWED_HOSTS=
```

`http://localhost:54321` matches common local Supabase Docker defaults.

Hosted example:

```env
# backend .env
PORT=8797
ALLOWED_ORIGIN=https://prompt-canvas-demo.talenttic.co

# web/.env
VITE_API_BASE=https://api-prompt-canvas-demo.talenttic.co
VITE_ALLOWED_HOSTS=prompt-canvas-demo.talenttic.co
```

## Install

```bash
npm install
npm --prefix web install
```

## Run

```bash
npm run dev
```

- API: `http://localhost:8787`
- Web: `http://localhost:5173`

## Frontend routes
- `/login` - authentication page
- `/dashboard` - image generation workspace
- `/admin` - admin settings and logs (admin users only)

## Image provider switch
- Supported providers: `openai`, `pollinations`
- You can switch per-run from the Dashboard form.
- You can set default provider in Admin settings (`Default Image Provider`).

## Retry workflow
- `Retry Same Prompt`: retries generation for a specific image with the same prompt.
- `Refine + Retry`: appends refinement instructions and retries as a new attempt.
- Retry attempts are stored in manifest with metadata (`attempt`, `retryType`, `parentId`).

## Backend logs
- All API requests are logged with `requestId`, method, path, status, and duration.
- Generation services log per-image start/success/error and provider timings.
- If generation appears stuck, check server logs for timeout/error events.

## Discord notifications
- Optional Discord webhook notifications are supported for:
- login events (`POST /api/auth/login-event`)
- successful image generation batches (`POST /api/generate`, `POST /api/generate/stream`)
- successful retries (`POST /api/retry`)

Backend `.env`:

```env
# Option A: set webhook directly
DISCORD_NOTIFICATION=https://discord.com/api/webhooks/...

# Option B: toggle + separate URL
DISCORD_NOTIFICATION=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: URL prefix used for image links in embeds
DISCORD_PUBLIC_BASE_URL=https://demo.yourdomain.com
```

Notes:
- Notifications are non-blocking (request still completes if Discord is down).
- Generation embeds include blog title and image preview link.
- To avoid Discord limits, at most 5 images are embedded per event.

## Auth flow (Supabase)

1. User signs in/signs up in React app via Supabase client.
2. Supabase returns access token.
3. React sends `Authorization: Bearer <token>` to backend.
4. Backend verifies JWT with `SUPABASE_JWT_SECRET`.
5. Backend allows/denies protected routes.

## Admin dashboard and logs

### Admin access
- Admin users are controlled by `ADMIN_EMAILS` env var.
- Admins can open dashboard admin sections in the UI.
- Admin section supports:
  - System readiness checks (required env setup status)
  - App branding settings (`appName`, `companyName`)
  - Prompt branding settings (brand name, audience, style lists, palette, restrictions)
  - UI theme settings (primary/secondary/accent/surface/background colors)

### Logged actions
The backend writes JSONL entries to `output/audit-log.jsonl` for:
- `auth.login`
- `generate.success`
- `generate.failed`
- `manifest.view`
- `admin.logs.view`
- `admin.settings.update`

Each log contains:
- timestamp
- user email + user id
- action type
- IP + user-agent
- action details (for generation: titles and output slugs)

## Temporary test login (skip Supabase signup)

If Supabase signup is blocked (for example SMTP/email confirmation issues), you can use a backend test login.

In backend `.env`:

```env
TEST_LOGIN_ENABLED=true
TEST_LOGIN_EMAIL=test@example.com
TEST_LOGIN_PASSWORD=change_me
TEST_LOGIN_TOKEN=dev-test-token
```

Then in the login screen:
1. Enter `TEST_LOGIN_EMAIL` and `TEST_LOGIN_PASSWORD`
2. Click `Test Login`

This keeps auth flow enabled while bypassing user signup temporarily.
When `TEST_LOGIN_ENABLED=true`, the UI automatically hides the `Sign Up` button.

## API routes

- `GET /api/health`
- `GET /api/config/public`
- `GET /api/auth/mode`
- `GET /api/me` (auth)
- `POST /api/auth/test-login` (if enabled)
- `POST /api/auth/login-event` (auth)
- `POST /api/generate` (auth)
- `POST /api/retry` (auth)
- `GET /api/manifest` (auth)
- `GET /api/admin/logs` (auth + admin)
- `GET /api/admin/settings` (auth + admin)
- `PUT /api/admin/settings` (auth + admin)
- `GET /images/:file`

## How to test

### Smoke test
1. Start app:

```bash
npm run dev
```

2. Confirm API:

```bash
curl http://localhost:8787/api/health
```

Expected:

```json
{"ok":true}
```

3. Sign in through web UI (`http://localhost:5173`).
4. Generate images from titles.
5. Confirm files:
- `output/images/*.png`
- `output/manifest.json`
- `output/audit-log.jsonl`

### Typecheck

```bash
npm run test
npm --prefix web run typecheck
```

## Security note

This design is suitable for hosted demos because users never receive your OpenAI API key. The key remains on the backend, and all generation requests go through authenticated API routes.

## Privacy

See [PRIVACY.md](./PRIVACY.md) for data handling and logging details.
