-- Living Frame Razorpay Phase 2

alter table public.orders
  add column if not exists currency text default 'INR',
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists paid_at timestamptz;

create unique index if not exists orders_razorpay_order_id_idx
on public.orders(razorpay_order_id)
where razorpay_order_id is not null;

-- If you tested Phase 1 before installing this patch, unpaid draft frames may
-- already exist in public.frames. This migration intentionally does not delete
-- anything automatically. Remove any known test-only draft frames manually
-- after verifying them.
