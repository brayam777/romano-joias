-- Schema for the standalone Romano Joias Supabase project.

create table if not exists public.romano_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

alter table public.romano_products enable row level security;

create policy "Public can view romano products"
  on public.romano_products for select
  using (true);

create policy "Admin can manage romano products"
  on public.romano_products for all
  using (auth.jwt() ->> 'email' = any (array['brayamfelipe02@gmail.com']))
  with check (auth.jwt() ->> 'email' = any (array['brayamfelipe02@gmail.com']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'romano-media',
  'romano-media',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do nothing;

create policy "Public can view romano media"
  on storage.objects for select
  using (bucket_id = 'romano-media');

create policy "Admin can upload romano media"
  on storage.objects for insert
  with check (bucket_id = 'romano-media' and auth.jwt() ->> 'email' = any (array['brayamfelipe02@gmail.com']));

create policy "Admin can update romano media"
  on storage.objects for update
  using (bucket_id = 'romano-media' and auth.jwt() ->> 'email' = any (array['brayamfelipe02@gmail.com']));

create policy "Admin can delete romano media"
  on storage.objects for delete
  using (bucket_id = 'romano-media' and auth.jwt() ->> 'email' = any (array['brayamfelipe02@gmail.com']));
