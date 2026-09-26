# Living Frame Customer Ordering — Phase 1

This patch adds the guest customer journey:

Home
→ upload photo/video
→ choose frame and size
→ create draft order
→ upload originals directly to private Supabase Storage
→ delivery details
→ payment placeholder

No customer login is used.

## Included frontend files

- `frontend/index.html`
- `frontend/checkout.html`
- `frontend/payment.html`
- `frontend/assets/css/order.css`
- `frontend/assets/js/order.js`
- `frontend/assets/js/checkout.js`

## Backend

Overwrite:
`cloudflare-worker/src/index.js`

Worker version becomes `3.0.0`.

## Database

Run:
`sql/002-customer-orders-phase1.sql`

in Supabase SQL Editor.

## Install

Copy the patch files into:
`D:\AR\LivingFrame-full-project`

Then run the SQL migration.

Deploy the Worker:

```powershell
cd D:\AR\LivingFrame-full-project\cloudflare-worker
npm.cmd run deploy
```

Test `/api/health` and confirm `3.0.0`.

Push frontend:

```powershell
cd D:\AR\LivingFrame-full-project
git add .
git commit -m "Add guest customer ordering phase 1"
git push
```

## Test flow

Open:
`https://living-frame.pages.dev/`

1. Select a photo.
2. Select a video.
3. Choose frame/size.
4. Click Order this frame.
5. Files upload to private Supabase Storage.
6. Delivery page opens.
7. Enter delivery details.
8. Continue to payment.
9. Payment page shows the Phase 1 placeholder.

The created frame will appear in the existing admin dashboard with status `assets_uploaded`.

## Current placeholder choices

Frame styles:
- Classic Black
- Natural Oak
- Gallery White

Sizes:
- 8×10
- 12×16

These are placeholders until your real frame catalog and prices are finalized.

## Production hardening before launch

The draft endpoint is intentionally simple for MVP testing. Before public launch add:
- Cloudflare Turnstile
- rate limiting
- finalized MIME/type restrictions
- real catalog/prices
- abandoned draft cleanup
- Razorpay payment verification

Supabase signed upload URLs are time-limited and let the browser upload without exposing the backend secret key.
