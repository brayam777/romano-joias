-- Lets each product carry multiple media items (photos and/or a video),
-- shown as a swipeable carousel on the site instead of one photo per product.

alter table public.romano_products
  add column if not exists media jsonb not null default '[]'::jsonb;

update public.romano_products
set media = jsonb_build_array(jsonb_build_object('url', media_url, 'type', coalesce(media_type, 'image')))
where media_url is not null and jsonb_array_length(media) = 0;

alter table public.romano_products drop column if exists media_url;
alter table public.romano_products drop column if exists media_type;
