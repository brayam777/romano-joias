-- Adds a single "featured" spotlight slot for the catalog (the "vitrine em destaque").

alter table public.romano_products
  add column if not exists is_featured boolean not null default false;

-- Only one product can be featured at a time.
create unique index if not exists romano_products_one_featured
  on public.romano_products ((is_featured))
  where is_featured;
