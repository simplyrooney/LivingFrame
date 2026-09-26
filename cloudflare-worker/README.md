# Living Frame Admin Dashboard V1

Copy these files into your existing `LivingFrame-full-project`:

- `frontend/admin.html`
- `frontend/assets/css/admin.css`
- `frontend/assets/js/admin.js`
- overwrite `cloudflare-worker/src/index.js`

## Configure admin

In Supabase Dashboard -> Authentication -> Users, copy the UUID of the Supabase user you want to use as admin.

Then edit `cloudflare-worker/wrangler.toml` and add inside `[vars]`:

```toml
FRONTEND_ORIGIN = "https://living-frame.pages.dev"
SUPABASE_URL = "https://wmewylplpsyomqrahiwe.supabase.co"
ADMIN_USER_ID = "PASTE_ADMIN_USER_UUID_HERE"
PHOTO_BUCKET = "living-frame-photos"
VIDEO_BUCKET = "living-frame-videos"
```

Do not put Supabase secret keys in `wrangler.toml`.

## Confirm secrets

```powershell
cd D:\AR\LivingFrame-full-project\cloudflare-worker
npx.cmd wrangler secret list
```

You need:
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Database

If `customer_name`, `customer_email`, `admin_notes` and the new statuses already exist, skip this.
Otherwise run `admin-dashboard-migration.sql` in Supabase SQL Editor.

## Deploy Worker

```powershell
npm.cmd run deploy
```

Health should show version `2.0.0`.

## Push frontend

```powershell
cd D:\AR\LivingFrame-full-project
git add .
git commit -m "Add Living Frame admin dashboard"
git push
```

Cloudflare Pages should redeploy automatically.

## Open admin

https://living-frame.pages.dev/admin.html

Sign in using the Supabase admin user's email/password.

## Features

- list all frame orders
- private signed photo/video links
- image preview
- paste MyWebAR published URL
- change order status
- admin notes
- test AR viewer link

Every `/api/admin/*` request verifies a real Supabase Auth token and then checks the signed-in user's UUID against `ADMIN_USER_ID`.
