# Living Frame Backend Netlify V2

This version removes Express and serverless-http to make Netlify deployment simpler.

## Deploy with GitHub
1. Extract the ZIP.
2. Push these files to a new GitHub repository.
3. Netlify -> Add new site -> Import existing project.
4. Choose the repository.
5. Build command: leave blank.
6. Publish directory: `public`
7. Deploy.

`netlify.toml` already configures:
- publish folder
- functions folder
- `/api/*` redirect
- esbuild function bundling

## First test
Before adding Supabase variables, this URL should work after deploy:

`/api/health`

Expected:
`{"ok":true,"service":"living-frame-backend","runtime":"netlify-functions","version":"2.0.0"}`

The health endpoint intentionally does not need Supabase variables.

## Then add environment variables
Use Netlify -> Site configuration -> Environment variables.

Add all variables from `.env.example`.

## Supabase
Run `sql/001_schema.sql` in Supabase SQL Editor and create these private buckets:
- living-frame-photos
- living-frame-videos
- living-frame-processed
