# Requires a fresh $token from Supabase login.
$backend = "https://dulcet-melba-2ada13.netlify.app"
$frameId = "efcbd075-4cf3-4782-9c49-29e9821cfc0a"

$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

$myWebArUrl = "PASTE_PUBLISHED_MYWEEBAR_HTTPS_URL_HERE"

$body = @{
  ar_provider = "mywebar"
  ar_experience_url = $myWebArUrl
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Patch `
  -Uri "$backend/api/frames/$frameId/ar" `
  -Headers $headers `
  -Body $body

Invoke-RestMethod `
  -Method Get `
  -Uri "$backend/api/public/frames/LF-6CSUU7EZ"
