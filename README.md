# Living Frame

Current MVP stack:

- Frontend: Cloudflare Pages
- Backend: Cloudflare Workers
- Database: Supabase Postgres
- Authentication: Supabase Auth
- Photo/video storage: Supabase Storage
- AR: MyWebAR
- Video processing: None for now

## Project structure

```text
LivingFrame-full-project/
├── frontend/
│   ├── index.html
│   ├── ar-viewer.html
│   └── assets/
├── cloudflare-worker/
│   ├── src/index.js
│   ├── package.json
│   └── wrangler.toml
├── sql/
├── docs/
├── archive/
└── README.md
```

## Important security

Do not commit Supabase secret/service-role keys.
If a secret key has ever been pasted publicly or into chat, rotate it in Supabase and update the Cloudflare Worker secret.
