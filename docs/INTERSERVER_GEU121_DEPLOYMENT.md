# InterServer deployment: GEU-121

This runbook uses `geu-121` as the machine-readable university ID. The control dashboard lowercases IDs, so enter `GEU-121` or `geu-121` there. It assumes `taskely.online` serves both the university frontend and `/api` on one university VPS. Set `CONTROL_ORIGIN` to the separately deployed super-admin service's HTTPS origin. Do not run the control and university processes against the same MongoDB database.

The commands below target Ubuntu 24.04 on an InterServer VPS. Replace `VPS_IP`, `SSH_USER`, `SSH_KEY`, `CONTROL_ORIGIN`, administrator email/password, and all generated secrets. Run shell commands on the machine indicated by each heading. Keep secrets out of the repository and shell history. A deployment is complete only after the checks at the end pass.

## 1. Control installation and university registration

On the **control VPS**, deploy the control codebase per [multi-university deployment](MULTI_UNIVERSITY_DEPLOYMENT.md) with `PEERPREP_DEPLOYMENT_ROLE=control`, its own `MONGODB_URI`, `FRONTEND_ORIGIN`, `JWT_SECRET`, and admin account. Build its frontend with `VITE_PEERPREP_DEPLOYMENT_ROLE=control`. Give the control site and API an HTTPS origin reachable from `taskely.online`'s VPS. The control VPS needs the same Ubuntu packages and firewall setup as section 2, but its MongoDB database and user must be distinct, for example `peerprep_control` and `control_app`.

For a new control VPS, repeat the package commands in section 2 there, create a MongoDB administrator and `control_app` user with `readWrite` on `peerprep_control` using the pattern in section 3, then enable MongoDB authorization. Transfer the main codebase to `/srv/peerprep/control` and run `npm ci` in both `backend` and `frontend`. Use a control domain such as `admin.taskely.online` only after its A record points to the control VPS. Set the control backend env as follows (use distinct random passwords/secrets and the actual domain):

```dotenv
NODE_ENV=production
PORT=4000
TRUST_PROXY=1
PEERPREP_DEPLOYMENT_ROLE=control
MONGODB_URI=mongodb://control_app:URL_ENCODED_PASSWORD@127.0.0.1:27017/peerprep_control?authSource=peerprep_control&directConnection=true
FRONTEND_ORIGIN=https://REPLACE_CONTROL_DOMAIN
FRONTEND_URL=https://REPLACE_CONTROL_DOMAIN
JWT_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
ADMIN_EMAIL=REPLACE_WITH_SUPER_ADMIN_EMAIL
ADMIN_PASSWORD=REPLACE_WITH_TEMPORARY_BOOTSTRAP_PASSWORD
PEERPREP_INSPECTION_PRIVATE_KEY=REPLACE_WITH_BASE64_PRIVATE_KEY
```

Set the control frontend `.env.production` to `VITE_PEERPREP_DEPLOYMENT_ROLE=control` and `VITE_API_URL=https://REPLACE_CONTROL_DOMAIN`. Then, in its backend and frontend respectively:

```bash
cd /srv/peerprep/control/backend
sudo -u peerprep npm ci
sudo -u peerprep npm run migrate:platform-indexes
sudo -u peerprep npm run bootstrap
cd /srv/peerprep/control/frontend
sudo -u peerprep npm ci
sudo -u peerprep npm run build
```

Use the Nginx and systemd examples in section 5 with the control domain, `/srv/peerprep/control` paths and a `peerprep-control` service name. Then run `sudo certbot --nginx -d REPLACE_CONTROL_DOMAIN`, check `/api/health`, log into the control site, and remove `ADMIN_PASSWORD` from the control `.env` after changing it. The control frontend and API may share that HTTPS domain exactly as the university frontend and API share `taskely.online`.

Generate the inspection signing pair **on the control VPS**. Only the public key goes to the university VPS:

```bash
umask 077
openssl genpkey -algorithm ED25519 -out /tmp/peerprep-inspection-private.pem
openssl pkey -in /tmp/peerprep-inspection-private.pem -outform DER | base64 -w0
echo
openssl pkey -in /tmp/peerprep-inspection-private.pem -pubout -outform DER | base64 -w0
echo
```

Put the first output in the control backend `.env` as `PEERPREP_INSPECTION_PRIVATE_KEY`. Put the second output in the university backend `.env` as `PEERPREP_INSPECTION_PUBLIC_KEY`. After both are saved and backed up securely, remove the temporary PEM file. Restart the control backend after setting its private key. These are Ed25519 DER keys encoded as base64; the public key lets the university verify a short-lived read-only inspection request. The private key must never be on the university VPS.

Run `npm run migrate:platform-indexes` and `npm run bootstrap` once in the control backend. In the control admin sidebar, open **Universities**, create `geu-121`, set frontend URL and university API URL both to `https://taskely.online`, and save the one-time API key. Set its permissions and shared learning/question sources. Assessment assignments remain selected per university. The student detail view will become available once the university API is live.

## 2. DNS and VPS base packages

At the domain's DNS provider, create an **A record** for `taskely.online` (`@`) pointing to the university VPS public IP. If using a separate API hostname later, add another A record and change the frontend API build setting and control registry API URL accordingly. Wait for `dig +short taskely.online` to return the VPS IP.

From your workstation:

```bash
export VPS_IP='REPLACE_WITH_PUBLIC_IP'
export SSH_USER='root'
export SSH_KEY="$HOME/.ssh/REPLACE_WITH_KEY"
ssh -i "$SSH_KEY" "$SSH_USER@$VPS_IP"
```

On the **university VPS**, install Ubuntu packages, Node.js 22 (the frontend declares Node 22), MongoDB 8, Redis, Nginx and Certbot. Review the downloaded NodeSource script before executing it:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg nginx redis-server ufw snapd git rsync
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource-setup.sh
less /tmp/nodesource-setup.sh
sudo bash /tmp/nodesource-setup.sh
sudo apt install -y nodejs
node --version
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo 'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod redis-server nginx
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Keep MongoDB and Redis bound to `127.0.0.1`. Do not open 27017, 6379 or the Node port in UFW. Ensure the VPS has adequate memory for MongoDB, the frontend build and workers; add swap or build the frontend off-VPS if resources are tight. Configure Redis with `maxmemory-policy noeviction` for BullMQ queue data in `/etc/redis/redis.conf`, then restart Redis.

## 3. MongoDB credentials

Set a distinct strong MongoDB application password. The app user has access only to `peerprep_geu121`:

```bash
read -rsp 'MongoDB administrator password: ' MONGO_ADMIN_PASSWORD; echo
read -rsp 'MongoDB app password: ' MONGO_APP_PASSWORD; echo
export MONGO_ADMIN_PASSWORD MONGO_APP_PASSWORD
mongosh --quiet --eval 'db.getSiblingDB("admin").createUser({user:"peerprep_db_admin",pwd:process.env.MONGO_ADMIN_PASSWORD,roles:[{role:"userAdminAnyDatabase",db:"admin"},{role:"readWriteAnyDatabase",db:"admin"}]}); db.getSiblingDB("peerprep_geu121").createUser({user:"geu121_app",pwd:process.env.MONGO_APP_PASSWORD,roles:[{role:"readWrite",db:"peerprep_geu121"}]})'
unset MONGO_ADMIN_PASSWORD MONGO_APP_PASSWORD
sudo nano /etc/mongod.conf
sudo systemctl restart mongod
```

In `/etc/mongod.conf`, add a single top-level `security:` block with `authorization: enabled`; keep `net.bindIp: 127.0.0.1`. Both users must be created successfully before enabling authorization. Back up `peerprep_geu121` on a schedule and test restores.

URL-encode the application password before putting it in `MONGODB_URI` (for example, `@` becomes `%40`). Use `authSource=peerprep_geu121`. Never use the control database URI on this VPS.

## 4. Independent university codebase

On your **workstation**, create a separate copy and transfer it. Use a fresh target directory, and do not transfer existing `.env` secrets:

```bash
./deploy/create-university-codebase.sh geu-121 ../peerprep-geu-121
rsync -az --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.env*' \
  -e "ssh -i $SSH_KEY" ../peerprep-geu-121/ "$SSH_USER@$VPS_IP:/tmp/peerprep-geu-121/"
```

On the **university VPS**:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin peerprep || true
sudo mkdir -p /srv/peerprep/geu-121
sudo rsync -a /tmp/peerprep-geu-121/ /srv/peerprep/geu-121/
sudo chown -R peerprep:peerprep /srv/peerprep/geu-121
sudo -u peerprep npm ci --prefix /srv/peerprep/geu-121/backend
sudo -u peerprep npm ci --prefix /srv/peerprep/geu-121/frontend
sudo -u peerprep install -m 600 /dev/null /srv/peerprep/geu-121/backend/.env
sudo -u peerprep install -m 600 /dev/null /srv/peerprep/geu-121/frontend/.env.production
```

Fill `/srv/peerprep/geu-121/backend/.env` as `peerprep` (for example, with `sudo -u peerprep nano ...`):

```dotenv
NODE_ENV=production
PORT=4000
TRUST_PROXY=1
PEERPREP_DEPLOYMENT_ROLE=university
PEERPREP_UNIVERSITY_ID=geu-121
PEERPREP_CONTROL_URL=https://REPLACE_CONTROL_ORIGIN
PEERPREP_SHARED_API_KEY=REPLACE_WITH_ONE_TIME_KEY_FROM_CONTROL_DASHBOARD
PEERPREP_INSPECTION_PUBLIC_KEY=REPLACE_WITH_BASE64_PUBLIC_KEY
MONGODB_URI=mongodb://geu121_app:URL_ENCODED_PASSWORD@127.0.0.1:27017/peerprep_geu121?authSource=peerprep_geu121&directConnection=true
FRONTEND_ORIGIN=https://taskely.online
FRONTEND_URL=https://taskely.online
JWT_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
START_EXECUTION_WORKERS=false
START_SCHEDULED_JOBS=false
START_MAIL_WORKER=false
ADMIN_EMAIL=REPLACE_WITH_UNIVERSITY_ADMIN_EMAIL
ADMIN_PASSWORD=REPLACE_WITH_TEMPORARY_BOOTSTRAP_PASSWORD
```

`PEERPREP_CONTROL_URL` is an origin such as `https://control.example.com`, with no `/api` suffix. Generate a unique JWT secret for this installation (`openssl rand -base64 48`). Add SMTP, object storage, compiler/Judge0 and interview runtime credentials from the existing deployment environment before testing those modules; their integrations will not work merely from starting the core web app.

Set `/srv/peerprep/geu-121/frontend/.env.production`:

```dotenv
VITE_PEERPREP_DEPLOYMENT_ROLE=university
VITE_API_URL=https://taskely.online
```

Build and bootstrap:

```bash
cd /srv/peerprep/geu-121/backend
sudo -u peerprep npm run bootstrap
cd /srv/peerprep/geu-121/frontend
sudo -u peerprep npm run build
```

After the admin has logged in and changed the temporary password, remove `ADMIN_PASSWORD` from `.env` and restart. If you remove it immediately after bootstrap, the generated account remains; use a secure password transfer method.

## 5. API service, Nginx and HTTPS

Create `/etc/systemd/system/peerprep-geu121.service`:

```ini
[Unit]
Description=PeerPrep GEU-121 API
After=network-online.target mongod.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=peerprep
Group=peerprep
WorkingDirectory=/srv/peerprep/geu-121/backend
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/peerprep/geu-121

[Install]
WantedBy=multi-user.target
```

Create `/etc/nginx/sites-available/peerprep-geu121`:

```nginx
server {
    listen 80;
    server_name taskely.online;
    root /srv/peerprep/geu-121/frontend/dist;
    index index.html;
    client_max_body_size 30m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / { try_files $uri $uri/ /index.html; }
}
```

Enable and start:

```bash
sudo ln -s /etc/nginx/sites-available/peerprep-geu121 /etc/nginx/sites-enabled/peerprep-geu121
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now peerprep-geu121
sudo systemctl status peerprep-geu121 --no-pager
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d taskely.online
sudo certbot renew --dry-run
```

If `/usr/bin/certbot` already exists, skip the symlink. Run Certbot only after DNS resolves to the VPS and ports 80/443 are reachable.

## 6. Verification

On the university VPS and from the workstation:

```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS https://taskely.online/api/health
curl -fsS https://taskely.online/ | head
sudo journalctl -u peerprep-geu121 -n 100 --no-pager
```

In the control dashboard confirm that `geu-121` has a recent heartbeat, then use **View students**. Add a test student on the university site and confirm the list/detail view. Check that assessments, results and interview status appear only for that student's university. Temporarily stop the university API and verify that **View students** reports unavailable while the last heartbeat counts remain visible; restart afterward. Verify a wrong/missing inspection signature returns 401 and that the university browser does not receive either inspection key or shared API key.

Run `sudo systemctl restart peerprep-geu121` after backend env/code updates. For code updates, transfer a new independent university release, run `npm ci`, rebuild the frontend, and restart the service. Back up the university MongoDB before migrations. Configure the application's compiler, assessment, maintenance and mail workers as separate systemd services when those features are enabled, using the `worker:*` scripts in `backend/package.json` and the same `.env`.

Official setup references: [InterServer Ubuntu VPS](https://www.interserver.net/vps/ubuntu-vps.html), [MongoDB 8 Ubuntu installation](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/), [NodeSource distributions](https://github.com/nodesource/distributions), [Certbot with Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap), [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).
