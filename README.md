# Living Frame Admin Media Fix

This fixes both issues shown in the screenshots:

1. View / Download buttons are placed in a dedicated footer below each upload.
2. Photo and video use `object-fit: contain`, so the full uploaded media is visible.
3. Downloads now use the ORDER record instead of the fulfilment FRAME record.
   This means even guest/pending orders with no frame record can be downloaded.

## Install

### 1. Replace admin.js
Replace:
frontend/assets/js/admin.js

with:
frontend/assets/js/admin.js from this package.

### 2. Add CSS file
Copy:
frontend/assets/css/admin-media-fix.css

Then in frontend/admin.html add this AFTER the other admin CSS files:

<link rel="stylesheet" href="./assets/css/admin-media-fix.css">

It must load last so it overrides older conflicting media styles.

### 3. Add Worker order-download route
Copy the route from:
cloudflare-worker/admin-order-download-route.txt

Paste it inside cloudflare-worker/src/index.js,
inside fetch(),
before the final:
return json({error:"Not found"},404,cors);

### 4. Deploy Worker
cd D:\AR\LivingFrame-full-project\cloudflare-worker
npm.cmd run deploy

### 5. Deploy frontend
cd D:\AR\LivingFrame-full-project
git add .
git commit -m "Fix admin media preview and download buttons"
git push

Then hard refresh the admin page with Ctrl+Shift+R.
