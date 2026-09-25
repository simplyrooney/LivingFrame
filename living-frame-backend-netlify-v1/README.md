# Living Frame Backend — Netlify Functions Edition

This fixes the 404 you saw when the previous Express backend was uploaded as a static Netlify site.

## Important
Do **not** use Netlify Drop for this backend. Functions need a build/deploy through:
- Netlify Git deployment, or
- Netlify CLI

## Quick deploy
1. Create a GitHub repo with these files.
2. In Netlify: Add new site -> Import an existing project -> GitHub.
3. Build command: leave blank.
4. Publish directory: `public`
5. Functions directory is already configured in `netlify.toml`.
6. Add environment variables from `.env.example`.
7. Deploy.

After deployment:
- `/` shows a backend status page.
- `/api/health` should return JSON:
  `{"ok":true,"service":"living-frame-backend","runtime":"netlify-functions"}`

Then we can connect the finalized frontend:
https://resilient-arithmetic-e273b1.netlify.app/
