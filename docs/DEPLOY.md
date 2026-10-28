# Deploy to one Ubuntu server

One small VPS (Vultr or similar) runs everything: Caddy serves the built web app and proxies `/api/*` to the Fastify API, which pm2 keeps running on `127.0.0.1:5181`. The whole site sits behind one basic-auth login. Placeholders below are in angle brackets; never commit real hosts, users or secrets.

## 1. Server setup (once)

Ubuntu 24.04, as a sudo user:

```bash
sudo apt update && sudo apt install -y git caddy ufw
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@9.15.9 --activate
sudo npm install -g pm2

sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

On a 2 GB box, add swap so `pnpm build` does not run out of memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Point a DNS record for `<your-host>` at the server so Caddy can get a certificate.

## 2. Code and settings

```bash
sudo mkdir -p /opt/kestrel && sudo chown "$USER" /opt/kestrel
git clone <repo-url> /opt/kestrel
cd /opt/kestrel
cp .env.example .env && chmod 600 .env
caddy hash-password    # type the site password; copy the printed hash
```

Edit `.env` (it stays on the server; never commit, print or copy it):

| Variable | Needed | Purpose |
| --- | --- | --- |
| `KESTREL_HOST` | yes | Site address, e.g. `<your-host>` |
| `KESTREL_USER` | yes | Basic-auth user name |
| `KESTREL_PASS_HASH` | yes | Output of `caddy hash-password` (quote it if your editor needs it) |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `BEDROCK_MODEL_ID` | for live AI | Bedrock credentials for robot conversation |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | for voice | Speech in and out |
| `DATABASE_URL` | optional | Postgres for learner progress; `deploy.sh` runs `pnpm db:migrate` to create the tables. Unset keeps progress in the browser |
| `TIGER_DATABASE_URL` | legacy | The old Tiger Data hypertable, read only while `DATABASE_URL` is unset; never migrated (see `docs/adr/ADR-002-dsql-compatible-schema.md`) |
| `PORT` | no | API port; keep `5181` (the Caddyfile proxies to it) |

Without AI or voice keys the site still runs; those features report that the server is not configured. Live requests incur provider usage.

## 3. Deploy

```bash
cd /opt/kestrel
bash deploy/deploy.sh
```

`deploy/deploy.sh` is safe to run again for every update. It refuses to run without `.env`, sets it to mode 600, pulls with `--ff-only`, installs from the lockfile, builds, applies pending schema migrations (`pnpm db:migrate`, a no-op without `DATABASE_URL`), starts or restarts the `kestrel-api` pm2 process, saves the pm2 list and reloads Caddy with `deploy/Caddyfile`. It reads only the `KESTREL_*` lines of `.env` for Caddy.

Check: open `https://<your-host>`, sign in, and visit `/api/health`.

## 4. Survive a reboot

```bash
pm2 startup    # run the command it prints, then:
pm2 save
```

The system Caddy service starts from `/etc/caddy/Caddyfile`, not this repository's file, so after a reboot run `bash deploy/deploy.sh` again (or wire Caddy's systemd unit to `deploy/Caddyfile` with the three `KESTREL_*` values in its own environment file).

## Troubleshooting

- `pm2 logs kestrel-api` shows API output; `journalctl -u caddy` shows Caddy.
- 502 on `/api/*`: the API is not running on `127.0.0.1:5181`.
- 403 "Use the local Kestrel page." on `/api/*`: the API accepts only local Origins, so the Caddyfile rewrites the site's own Origin (`https://<your-host>`) to `http://127.0.0.1`. Check that `KESTREL_HOST` matches the address in the browser exactly; any other Origin is still refused.
- 403 or blank page: the `caddy` user cannot read `/opt/kestrel/apps/web/dist`.
