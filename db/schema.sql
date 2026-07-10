create table if not exists products (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null check (price_cents >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id bigserial primary key,
  order_number text not null unique,
  customer_email text not null,
  customer_name text not null,
  customer_phone text,
  shipping_name text not null,
  shipping_address_1 text not null,
  shipping_address_2 text,
  shipping_city text not null,
  shipping_state text not null,
  shipping_zip text not null,
  shipping_country text not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null default 'awaiting_payment' check (
    status in (
      'awaiting_payment',
      'payment_submitted',
      'paid',
      'processing',
      'shipped',
      'cancelled',
      'refunded'
    )
  ),
  payment_method text not null default 'manual_payment',
  payment_instructions_sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_created_idx on orders (status, created_at desc);
create index if not exists orders_customer_email_idx on orders (customer_email);

create table if not exists order_items (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id text references products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 20),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on order_items (order_id);

create table if not exists payment_proofs (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  payment_app text,
  payment_username text,
  screenshot_url text,
  note text,
  created_at timestamptz not null default now()
);

insert into products (id, name, slug, description, price_cents, image_url, is_active)
values
  ('glp-3rt-10mg', 'GLP-3RT 10MG', 'glp-3rt-10mg', 'Research peptide supplied for laboratory catalog workflows. Lot-verified documentation available.', 6900, 'assets/products/glp-3rt-10mg-float.png', true),
  ('glp-3rt-30mg', 'GLP-3RT 30MG', 'glp-3rt-30mg', 'Research peptide supplied for laboratory catalog workflows. Lot-verified documentation available.', 12900, 'assets/products/glp-3rt-30mg-float.png', true),
  ('glp-2tz-20mg', 'GLP-2TZ 20MG', 'glp-2tz-20mg', 'Research peptide supplied with third-party analytical review and batch documentation.', 14900, 'assets/products/glp-2tz-float.png', false),
  ('glp-2tz-30mg', 'GLP-2TZ 30MG', 'glp-2tz-30mg', 'Research peptide supplied with third-party analytical review and batch documentation.', 8900, 'assets/products/glp-2tz-float.png', true),
  ('bpc-157-10mg', 'BPC-157 10MG', 'bpc-157-10mg', 'Synthetic research peptide supplied for laboratory research purposes only.', 8900, 'assets/BPC.png', false),
  ('mt-2-10mg', 'MT-2 10MG', 'mt-2-10mg', 'Catalog research peptide with lot-specific documentation and analytical review.', 6900, null, false),
  ('ghk-cu-50mg', 'GHK-Cu 50MG', 'ghk-cu-50mg', 'Catalog research peptide supplied with batch tracking and documentation.', 3900, 'assets/products/ghk-cu-float.png', true),
  ('mots-c-10mg', 'MOTS-c 10MG', 'mots-c-10mg', 'Research peptide supplied with batch-specific COA access and third-party review.', 4900, 'assets/products/mots-c-float.png', true),
  ('mots-c-50mg', 'MOTS-c 50MG', 'mots-c-50mg', 'Research peptide supplied with batch-specific COA access and third-party review.', 11900, 'assets/MOTS.png', false)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  price_cents = excluded.price_cents,
  image_url = excluded.image_url,
  is_active = excluded.is_active;

-- Certificates of Analysis (COA drive)
create table if not exists coas (
  id text primary key,
  product_id text not null,
  product_name text not null,
  lot text not null,
  test_date date,
  purity text,
  method text,
  status text not null default 'Released',
  file_url text not null,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists coas_product_idx on coas (product_id);
