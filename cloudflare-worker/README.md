# Cloudflare Worker

## Secrets

Set these with Wrangler. Never commit the actual values.

```powershell
npx.cmd wrangler secret put SUPABASE_ANON_KEY
npx.cmd wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm.cmd run deploy
```

## Routes

- `GET /api/health`
- `GET /api/public/frames/:frameCode`
- `PATCH /api/frames/:id/ar`
