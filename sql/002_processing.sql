alter table public.frames
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists processing_attempts integer not null default 0;

create index if not exists frames_processing_queue_idx
  on public.frames(status, processing_started_at, created_at);
