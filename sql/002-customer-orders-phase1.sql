-- Living Frame customer ordering Phase 1

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id text not null,
  order_token uuid not null,
  frame_id uuid references public.frames(id) on delete set null,
  frame_code text not null,

  status text not null default 'draft',
  payment_status text not null default 'pending',

  frame_variant text not null,
  frame_size text not null,
  price_paise integer,

  photo_path text,
  video_path text,

  customer_name text,
  customer_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,

  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- No public RLS policies are created.
-- Customer order access goes through the Cloudflare Worker using a per-order token.
-- Admin access also goes through the authenticated Worker.

create index if not exists orders_order_number_idx on public.orders(order_number);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

alter table public.frames add column if not exists customer_id text;
alter table public.frames add column if not exists customer_name text;
alter table public.frames add column if not exists customer_email text;
