# Living Frame Processing V1

This package adds the first real video-processing pipeline.

## What it does

1. Customer uploads photo + video.
2. Netlify backend marks the frame `processing`.
3. Worker polls Supabase for queued frames.
4. Worker downloads the private photo and video.
5. Reads the photo dimensions.
6. Center-crops the video to the photo aspect ratio.
7. Never stretches the video.
8. Encodes H.264/AAC MP4 with fast-start.
9. Uploads to `living-frame-processed`.
10. Updates the frame:
   - `processed_video_path`
   - `target_width`
   - `target_height`
   - `status = ready`

## Step 1 — Run the SQL migration

In Supabase SQL Editor run:

`sql/002_processing.sql`

## Step 2 — Deploy backend V5

Replace the current Netlify backend repo contents with the files inside:

`backend-netlify-v5/`

Keep the same Netlify environment variables.

After deploy, `/api/health` should show:

`version: 5.0.0`

## Step 3 — Deploy the worker

The worker is a Docker app and needs FFmpeg. Do not deploy it as a normal Netlify Function.

Use any Docker-capable service or run locally for the first test.

Worker environment variables:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PHOTO_BUCKET=living-frame-photos
- VIDEO_BUCKET=living-frame-videos
- PROCESSED_BUCKET=living-frame-processed
- POLL_INTERVAL_MS=5000

## Local worker test

Docker:

```bash
docker build -t living-frame-worker ./worker
docker run --rm --env-file worker/.env living-frame-worker
```

Or install Node 20 + FFmpeg locally, then:

```bash
cd worker
npm install
npm start
```

## Queue the existing test frame

After Backend V5 is deployed and you have a fresh Supabase access token:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "$backend/api/frames/$frameId/process" `
  -Headers $headers
```

The API should return status `processing`.

The worker then processes it and the frame should become `ready`.

## Expected database result

- status = ready
- processed_video_path = <private object path>
- target_width = actual source-photo width
- target_height = actual source-photo height
- processing_started_at = timestamp
- processing_completed_at = timestamp
