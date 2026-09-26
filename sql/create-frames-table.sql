-- Living Frame schema
create extension if not exists pgcrypto;

create table if not exists public.frames (
  id uuid primary key default gen_random_uuid(),
  frame_code text unique not null,
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  status text not null default 'draft',
  photo_path text,
  video_path text,
  processed_video_path text,
  target_width integer,
  target_height integer,
  ar_provider text,
  ar_target_id text,
  ar_experience_url text,
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_attempts integer not null default 0,
  customer_name text,
  customer_email text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.frames enable row level security;

drop policy if exists "Users can read own frames" on public.frames;
create policy "Users can read own frames"
on public.frames for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own frames" on public.frames;
create policy "Users can create own frames"
on public.frames for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own frames" on public.frames;
create policy "Users can update own frames"
on public.frames for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
