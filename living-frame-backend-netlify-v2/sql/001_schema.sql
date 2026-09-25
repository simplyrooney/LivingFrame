create extension if not exists pgcrypto;

create table if not exists public.frames (
  id uuid primary key default gen_random_uuid(),
  frame_code text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled memory',
  status text not null default 'draft'
    check (status in ('draft','assets_uploaded','processing','ready','failed','archived')),
  photo_path text,
  video_path text,
  processed_video_path text,
  target_width integer,
  target_height integer,
  ar_provider text,
  ar_target_id text,
  ar_experience_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists frames_user_id_idx on public.frames(user_id);
create index if not exists frames_frame_code_idx on public.frames(frame_code);
