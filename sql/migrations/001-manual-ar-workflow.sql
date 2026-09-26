-- Manual AR fulfillment workflow
-- Run only if your existing status constraint blocks the new values.

alter table public.frames
drop constraint if exists frames_status_check;

alter table public.frames
add constraint frames_status_check
check (status in (
  'draft',
  'assets_uploaded',
  'awaiting_ar_setup',
  'ar_configured',
  'ready_to_print',
  'printed',
  'shipped',
  'ready',
  'failed',
  'archived'
));

alter table public.frames
add column if not exists customer_name text,
add column if not exists customer_email text,
add column if not exists admin_notes text;
