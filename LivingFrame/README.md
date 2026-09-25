# Living Frame Backend — Netlify V3

This package fixes the previous deployment problem by removing the `public` publish directory requirement.

The repository root must directly contain:

- `index.html`
- `package.json`
- `netlify.toml`
- `netlify/`
- `.env.example`

## Netlify
Import the GitHub repository.

Build command: leave blank  
Publish directory: leave blank if Netlify detects `netlify.toml`, or use `.`  
Functions directory: `netlify/functions`

After deployment test:

`/api/health`

Expected:

`{"ok":true,"service":"living-frame-backend","runtime":"netlify-functions","version":"3.0.0"}`

If your GitHub repo currently contains a folder like
`living-frame-backend-netlify-v2/` and the files are inside it,
either move those files to the repository root or set Netlify's
Base directory to that folder.
