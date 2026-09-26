-- Create these buckets in Supabase Storage if not already present:
-- living-frame-photos (private)
-- living-frame-videos (private)

insert into storage.buckets (id, name, public)
values
  ('living-frame-photos', 'living-frame-photos', false),
  ('living-frame-videos', 'living-frame-videos', false)
on conflict (id) do nothing;
