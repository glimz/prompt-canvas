# Run PromptCanvas Persistently + Cloudflare Tunnel

Use this guide when hosting on a remote VM so the app keeps running after VS Code disconnects and is reachable via a stable public URL.

## Architecture
- Backend API: `http://127.0.0.1:8797`
- React app (Vite): `http://127.0.0.1:5173`
- Public URLs via Cloudflare Tunnel (recommended):
- `https://app.yourdomain.com` -> `http://127.0.0.1:5173`
- `https://api.yourdomain.com` -> `http://127.0.0.1:8797`

## 1) Prepare environment

```bash
cd /root/prompt-canvas
npm install
npm --prefix web install
```

Create env files if needed:

```bash
cp -n .env.example .env
cp -n web/.env.example web/.env
```

Set backend `.env` at minimum:
- `OPENAI_API_KEY`
- `ALLOWED_ORIGIN=https://app.yourdomain.com`
- `AUTH_ENABLED=true`
- `SUPABASE_JWT_SECRET=...`

Set frontend `web/.env`:
- `VITE_API_BASE=https://api.yourdomain.com`
- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

## 2) Run persistently with PM2

Install PM2 once:

```bash
npm install -g pm2
```

Start API and Web as separate processes:

```bash
cd /root/prompt-canvas
pm2 start npm --name prompt-canvas-api -- run dev:api
pm2 start npm --name prompt-canvas-web -- run dev:web
```

Persist process list + reboot startup:

```bash
pm2 save
pm2 startup
```

Run the command PM2 prints after `pm2 startup`.

Useful PM2 commands:

```bash
pm2 status
pm2 logs prompt-canvas-api --lines 200
pm2 logs prompt-canvas-web --lines 200
pm2 restart prompt-canvas-api
pm2 restart prompt-canvas-web
```

## 3) Create persistent Cloudflare tunnel

### Install `cloudflared` (Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y curl gnupg lsb-release
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared noble main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version
```

### Login and create named tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create prompt-canvas
```

### Map DNS hostnames

```bash
cloudflared tunnel route dns prompt-canvas app.yourdomain.com
cloudflared tunnel route dns prompt-canvas api.yourdomain.com
```

### Create config

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://127.0.0.1:5173
  - hostname: api.yourdomain.com
    service: http://127.0.0.1:8797
  - service: http_status:404
```

### Install as service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager -l
```

If service already exists, do not reinstall. Update `/etc/cloudflared/config.yml` and restart:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager -l
```

## 4) Verify end-to-end

Local checks on server:

```bash
curl -s http://127.0.0.1:8797/api/health
curl -I http://127.0.0.1:5173
```

Public checks:

```bash
curl -s https://api.yourdomain.com/api/health
curl -I https://app.yourdomain.com
```

Open browser:
- `https://app.yourdomain.com`

## 5) Troubleshooting

Check PM2 state:

```bash
pm2 status
pm2 show prompt-canvas-api
pm2 show prompt-canvas-web
```

Check logs:

```bash
pm2 logs prompt-canvas-api --lines 200
pm2 logs prompt-canvas-web --lines 200
journalctl -u cloudflared --no-pager -n 200
```

Check local ports:

```bash
ss -ltnp | grep -E '5173|8797'
```

Common causes:
- `ALLOWED_ORIGIN` not matching public frontend domain.
- `VITE_API_BASE` still pointing to localhost.
- Missing `SUPABASE_JWT_SECRET` when `AUTH_ENABLED=true`.
- Cloudflare DNS not routed to the named tunnel.

## Notes
- Do not use temporary quick tunnels for demos you want to keep stable.
- Keep API keys only in backend `.env`, never in `web/.env`.
