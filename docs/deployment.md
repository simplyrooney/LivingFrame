# Deployment

## Backend - Cloudflare Worker

```powershell
cd cloudflare-worker
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler secret put SUPABASE_ANON_KEY
npx.cmd wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm.cmd run deploy
```

Current backend:
`https://living-frame-backend.livingframe-anshul.workers.dev`

## Frontend - Cloudflare Pages

Deploy the `frontend` folder.

After Cloudflare gives you the Pages URL, update:

`cloudflare-worker/wrangler.toml`

```toml
FRONTEND_ORIGIN = "https://YOUR-SITE.pages.dev"
```

Then redeploy the Worker.

## Test

Backend:
`/api/health`

Frame:
`/api/public/frames/LF-6CSUU7EZ`

Frontend AR:
`/ar-viewer.html?frame=LF-6CSUU7EZ`
