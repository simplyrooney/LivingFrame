# Living Frame MyWebAR Bridge V1

This adds a manual MyWebAR bridge without changing the automated Living Frame processing pipeline.

## Backend V6
Deploy `backend-netlify-v6` as the backend base directory.

New endpoints:
- PATCH `/api/frames/:id/ar` — save a published MyWebAR URL
- GET `/api/public/frames/:frameCode` — safe public lookup for the AR viewer

Health check should show `version: 6.0.0`.

## Frontend patch
Copy `frontend-patch/ar-viewer.html` into the root of the finalized frontend repository and redeploy.

Viewer:
`https://resilient-arithmetic-e273b1.netlify.app/ar-viewer.html?frame=LF-6CSUU7EZ`

## Current test frame
1. Manually create/publish the MyWebAR flat-image experience using the original target image and processed video.
2. Copy the published HTTPS experience URL.
3. Run `attach-mywebar.ps1` after inserting that URL and using a fresh `$token`.
4. Open the viewer URL above.

If MyWebAR refuses iframe embedding in a specific browser/session, the viewer includes a direct-open fallback.
