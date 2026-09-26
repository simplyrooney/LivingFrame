# Architecture

```text
Cloudflare Pages (frontend)
        |
        v
Cloudflare Worker (API)
        |
        v
Supabase
  - Postgres
  - Auth
  - Storage
        |
        v
MyWebAR (manual project setup per frame)
```

## Current principle

Original customer photo and video are stored unchanged.
There is no automatic FFmpeg crop/processing in the active MVP flow.
