-- =========================================================
-- ÉLAN — Dress Rental & Accounting System
-- Skema database PostgreSQL / Supabase
-- Empat entitas utama: dresses, rentals, payments, returns
-- Aman dijalankan berulang kali (idempotent).
-- =========================================================

create extension if not exists pgcrypto;

-- Keep existing return rows and constraints while normalizing the legacy
-- singular table name to the plural name used by this schema and API.
do $$
declare
  v_has_returns boolean;
  v_has_return boolean;
begin
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'returns' and c.relkind in ('r', 'p')
  ) into v_has_returns;
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'return' and c.relkind in ('r', 'p')
  ) into v_has_return;

  if v_has_return and not v_has_returns then
    alter table public."return" rename to returns;
  elsif v_has_return and v_has_returns then
    raise exception 'Both public.return and public.returns tables exist. Reconcile their data before applying the ÉLAN schema; no table was changed.';
  end if;
end;
$$;

-- =========================================================
-- DROP SEMUA OBJECT LAMA (urutan: view → trigger → function)
-- =========================================================
drop view if exists public.v_rental_summary cascade;

drop trigger if exists trg_dress_code on public.dresses;
drop trigger if exists trg_rental_code on public.rentals;
drop trigger if exists trg_payment_code on public.payments;
drop trigger if exists trg_return_code on public.returns;
drop trigger if exists trg_dresses_updated on public.dresses;
drop trigger if exists trg_rentals_updated on public.rentals;
drop trigger if exists trg_prevent_overlap on public.rentals;

drop function if exists public.record_return(uuid, date, text, numeric, numeric, text) cascade;
drop function if exists public.record_payment(uuid, text, date, numeric, text, text, text, text) cascade;
drop function if exists public.record_payment(uuid, text, date, numeric, text, text, text) cascade;
drop function if exists public.record_payment(uuid, text, date, numeric, text, text) cascade;
drop function if exists public.create_rental(uuid, text, text, text, text, date, date, numeric, numeric, numeric) cascade;
drop function if exists public.create_rental(uuid, text, text, text, text, date, date, numeric, numeric, numeric, text) cascade;
drop function if exists public.create_rental(uuid, text, text, text, text, date, date, numeric, numeric, numeric, text, text) cascade;
drop function if exists public.create_rental(uuid, text, text, text, text, date, date, numeric, numeric) cascade;
drop function if exists public.record_return(uuid, date, text, numeric, numeric, text, text) cascade;
drop function if exists public.cancel_payment(uuid, text) cascade;
drop function if exists public.cancel_rental(uuid, text) cascade;
drop function if exists public.cancel_rental(uuid) cascade;
drop function if exists public.set_dress_code() cascade;
drop function if exists public.set_rental_code() cascade;
drop function if exists public.set_payment_code() cascade;
drop function if exists public.set_return_code() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.prevent_overlapping_rentals() cascade;
drop function if exists public.generate_code(text, date) cascade;
drop function if exists public.generate_code(text) cascade;

-- =========================================================
-- A. TABEL DRESSES
-- =========================================================
create table if not exists public.dresses (
  id_dress uuid primary key default gen_random_uuid(),
  kode_dress text unique,
  nama_dress text not null check (length(trim(nama_dress)) > 0),
  ukuran text not null check (length(trim(ukuran)) > 0),
  warna text not null check (length(trim(warna)) > 0),
  tarif_sewa numeric(12,2) not null check (tarif_sewa >= 0),
  status text not null check (status in ('Tersedia', 'Disewa', 'Laundry', 'Rusak', 'Hilang')) default 'Tersedia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- B. TABEL RENTALS
-- =========================================================
create table if not exists public.rentals (
  id_penyewaan uuid primary key default gen_random_uuid(),
  id_dress uuid not null references public.dresses(id_dress) on delete restrict,
  kode_penyewaan text unique,
  nama_pelanggan text not null check (length(trim(nama_pelanggan)) > 0),
  no_telepon text not null check (length(trim(no_telepon)) > 0),
  email text,
  alamat text,
  tanggal_sewa date not null,
  tanggal_rencana_kembali date not null,
  tarif_sewa numeric(12,2) not null check (tarif_sewa >= 0),
  total_sewa numeric(14,2) not null check (total_sewa >= 0),
  status_penyewaan text not null check (status_penyewaan in ('Dipesan', 'Berjalan', 'Selesai', 'Dibatalkan')) default 'Dipesan',
  alasan_batal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rentals_date_valid check (tanggal_rencana_kembali >= tanggal_sewa)
);

-- =========================================================
-- C. TABEL PAYMENTS
-- =========================================================
create table if not exists public.payments (
  id_pembayaran uuid primary key default gen_random_uuid(),
  id_penyewaan uuid not null references public.rentals(id_penyewaan) on delete restrict,
  kode_pembayaran text unique,
  jenis_pembayaran text not null check (jenis_pembayaran in ('DP', 'Cicilan', 'Pelunasan', 'Denda')),
  tanggal_bayar date not null,
  jumlah_bayar numeric(14,2) not null check (jumlah_bayar > 0),
  metode_pembayaran text not null check (metode_pembayaran in ('Tunai', 'Transfer Bank', 'QRIS')),
  referensi text,
  status_pembayaran text not null check (status_pembayaran in ('Berhasil', 'Dibatalkan')) default 'Berhasil',
  kategori_denda text,
  alasan_batal text,
  total_tagihan_saat_bayar numeric(14,2),
  total_dibayar_saat_bayar numeric(14,2),
  sisa_tagihan_saat_bayar numeric(14,2),
  status_tagihan_saat_bayar text,
  created_at timestamptz not null default now(),
  constraint payments_kategori_denda_check check (
    kategori_denda is null or
    (jenis_pembayaran = 'Denda' and kategori_denda in ('Keterlambatan', 'Kerusakan/Kehilangan'))
  )
);

-- Upgrade tabel lama yang dibuat sebelum jenis_pembayaran ditambahkan.
-- Pembayaran lama diasumsikan sebagai pembayaran sewa, bukan pembayaran denda.
alter table public.payments
  add column if not exists jenis_pembayaran text;
alter table public.payments
  add column if not exists kategori_denda text;
alter table public.payments
  add column if not exists total_tagihan_saat_bayar numeric(14,2),
  add column if not exists total_dibayar_saat_bayar numeric(14,2),
  add column if not exists sisa_tagihan_saat_bayar numeric(14,2),
  add column if not exists status_tagihan_saat_bayar text;

update public.payments
set jenis_pembayaran = 'Cicilan'
where jenis_pembayaran is null;

alter table public.payments
  alter column jenis_pembayaran set default 'Cicilan',
  alter column jenis_pembayaran set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_jenis_pembayaran_check'
  ) then
    alter table public.payments
      add constraint payments_jenis_pembayaran_check
      check (jenis_pembayaran in ('DP', 'Cicilan', 'Pelunasan', 'Denda'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_kategori_denda_check'
  ) then
    alter table public.payments
      add constraint payments_kategori_denda_check
      check (
        kategori_denda is null or
        (jenis_pembayaran = 'Denda' and kategori_denda in ('Keterlambatan', 'Kerusakan/Kehilangan'))
      );
  end if;
end;
$$;

-- =========================================================
-- D. TABEL RETURNS
-- =========================================================
create table if not exists public.returns (
  id_pengembalian uuid primary key default gen_random_uuid(),
  id_penyewaan uuid not null unique references public.rentals(id_penyewaan) on delete restrict,
  kode_pengembalian text unique,
  tanggal_kembali_aktual date not null,
  kondisi_dress text not null check (kondisi_dress in ('Baik', 'Rusak', 'Hilang')),
  hari_terlambat integer not null default 0 check (hari_terlambat >= 0),
  denda_keterlambatan numeric(14,2) not null default 0 check (denda_keterlambatan >= 0),
  denda_kerusakan numeric(14,2) not null default 0 check (denda_kerusakan >= 0),
  total_denda numeric(14,2) not null default 0 check (total_denda >= 0),
  catatan text,
  created_at timestamptz not null default now()
);

-- Allow the browser client to use the public anon key without login for this
-- classroom project. This keeps the frontend connected directly to Supabase.
drop policy if exists "public_all_dresses" on public.dresses;
drop policy if exists "public_all_rentals" on public.rentals;
drop policy if exists "public_all_payments" on public.payments;
drop policy if exists "public_all_returns" on public.returns;

alter table public.dresses enable row level security;
alter table public.rentals enable row level security;
alter table public.payments enable row level security;
alter table public.returns enable row level security;

create policy "public_all_dresses" on public.dresses
  for all using (true) with check (true);
create policy "public_all_rentals" on public.rentals
  for all using (true) with check (true);
create policy "public_all_payments" on public.payments
  for all using (true) with check (true);
create policy "public_all_returns" on public.returns
  for all using (true) with check (true);

-- RLS policies do not grant SQL table privileges; the browser uses role anon.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on public.dresses, public.rentals, public.payments, public.returns
  to anon, authenticated;

-- Legacy fine payments can be classified when the associated return has only
-- one assessed fine type; ambiguous historical payments remain uncategorized.
update public.payments p
set kategori_denda = case
  when r.denda_keterlambatan > 0 and r.denda_kerusakan = 0 then 'Keterlambatan'
  when r.denda_kerusakan > 0 and r.denda_keterlambatan = 0 then 'Kerusakan/Kehilangan'
  else null
end
from (
  select id_penyewaan, max(denda_keterlambatan) as denda_keterlambatan,
    max(denda_kerusakan) as denda_kerusakan
  from public.returns
  group by id_penyewaan
  having count(*) = 1
) r
where p.id_penyewaan = r.id_penyewaan
  and p.jenis_pembayaran = 'Denda'
  and p.kategori_denda is null;

-- Align only the dress-condition CHECK used by the return form.
-- Supports both the canonical plural table and legacy singular table without
-- removing return rows, foreign keys, or the unique constraints.
do $$
declare
  v_relation record;
  v_invalid_values text[];
  v_constraint_name text;
begin
  for v_relation in
    select c.oid, n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relname in ('returns', 'return')
      and c.relkind in ('r', 'p')
      and a.attname = 'kondisi_dress'
      and not a.attisdropped
  loop
    execute format(
      'select array_agg(distinct kondisi_dress::text) from %I.%I where kondisi_dress is null or kondisi_dress not in (%L, %L, %L)',
      v_relation.nspname, v_relation.relname, 'Baik', 'Rusak', 'Hilang'
    ) into v_invalid_values;

    if v_invalid_values is not null then
      raise exception 'Tidak dapat memperbarui CHECK kondisi_dress pada %.%: data lama memiliki nilai kondisi di luar Baik/Rusak/Hilang (%). Tidak ada data yang diubah.',
        v_relation.nspname, v_relation.relname, array_to_string(v_invalid_values, ', ');
    end if;

    for v_constraint_name in
      select conname
      from pg_constraint
      where conrelid = v_relation.oid
        and conname in (
          v_relation.relname || '_kondisi_dress_check',
          'return_kondisi_dress_check'
        )
        and contype = 'c'
    loop
      execute format('alter table %I.%I drop constraint %I',
        v_relation.nspname, v_relation.relname, v_constraint_name);
    end loop;

    v_constraint_name := v_relation.relname || '_kondisi_dress_check';
    execute format(
      'alter table %I.%I add constraint %I check (kondisi_dress in (%L, %L, %L))',
      v_relation.nspname, v_relation.relname, v_constraint_name, 'Baik', 'Rusak', 'Hilang'
    );
  end loop;
end;
$$;

-- =========================================================
-- TABEL COUNTER KODE OTOMATIS
-- =========================================================
create table if not exists public.code_counters (
  prefix text not null,
  period text not null,
  last_number integer not null default 0,
  primary key (prefix, period)
);

-- =========================================================
-- FUNCTION: generate kode unik per prefix dan tanggal transaksi
-- Format: DRS-DDMMYY-0001, RNT-DDMMYY-0001, PAY-DDMMYY-0001, RTN-DDMMYY-0001.
-- =========================================================
create or replace function public.generate_code(
  p_prefix text,
  p_date date default current_date
)
returns text as $$
declare
  v_period text;
  v_number integer;
  v_code text;
  v_exists boolean;
begin
  if p_prefix not in ('DRS', 'RNT', 'PAY', 'RTN') then
    raise exception 'Prefix kode tidak valid.';
  end if;
  if p_date is null then
    raise exception 'Tanggal kode wajib diisi.';
  end if;

  v_period := to_char(p_date, 'DDMMYY');

  loop
    insert into public.code_counters (prefix, period, last_number)
    values (p_prefix, v_period, 1)
    on conflict (prefix, period)
    do update set last_number = public.code_counters.last_number + 1
    returning last_number into v_number;

    if v_number > 9999 then
      raise exception 'Nomor urut harian untuk % telah mencapai batas.', p_prefix;
    end if;

    v_code := p_prefix || '-' || v_period || '-' || lpad(v_number::text, 4, '0');
    case p_prefix
      when 'DRS' then select exists(select 1 from public.dresses where kode_dress = v_code) into v_exists;
      when 'RNT' then select exists(select 1 from public.rentals where kode_penyewaan = v_code) into v_exists;
      when 'PAY' then select exists(select 1 from public.payments where kode_pembayaran = v_code) into v_exists;
      when 'RTN' then select exists(select 1 from public.returns where kode_pengembalian = v_code) into v_exists;
    end case;

    if not v_exists then
      return v_code;
    end if;
  end loop;
end;
$$ language plpgsql
security definer
set search_path = public, pg_temp;

-- =========================================================
-- TRIGGER FUNCTIONS: kode otomatis
-- =========================================================
create or replace function public.set_dress_code()
returns trigger as $$
begin
  if new.kode_dress is null or new.kode_dress = '' then
    new.kode_dress := public.generate_code('DRS', current_date);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_rental_code()
returns trigger as $$
begin
  if new.kode_penyewaan is null or new.kode_penyewaan = '' then
    new.kode_penyewaan := public.generate_code('RNT', new.tanggal_sewa);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_payment_code()
returns trigger as $$
begin
  if new.kode_pembayaran is null or new.kode_pembayaran = '' then
    new.kode_pembayaran := public.generate_code('PAY', new.tanggal_bayar);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.set_return_code()
returns trigger as $$
begin
  if new.kode_pengembalian is null or new.kode_pengembalian = '' then
    new.kode_pengembalian := public.generate_code('RTN', new.tanggal_kembali_aktual);
  end if;
  return new;
end;
$$ language plpgsql;

-- Pasang trigger kode otomatis
create trigger trg_dress_code
before insert on public.dresses
for each row execute function public.set_dress_code();

create trigger trg_rental_code
before insert on public.rentals
for each row execute function public.set_rental_code();

create trigger trg_payment_code
before insert on public.payments
for each row execute function public.set_payment_code();

create trigger trg_return_code
before insert on public.returns
for each row execute function public.set_return_code();

-- =========================================================
-- TRIGGER updated_at
-- =========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_dresses_updated
before update on public.dresses
for each row execute function public.set_updated_at();

create trigger trg_rentals_updated
before update on public.rentals
for each row execute function public.set_updated_at();

-- =========================================================
-- PREVENT OVERLAP RENTAL
-- =========================================================
create or replace function public.prevent_overlapping_rentals()
returns trigger as $$
begin
  if new.status_penyewaan in ('Dipesan', 'Berjalan') then
    if exists (
      select 1 from public.rentals r
      where r.id_dress = new.id_dress
        and r.id_penyewaan <> coalesce(new.id_penyewaan, '00000000-0000-0000-0000-000000000000'::uuid)
        and r.status_penyewaan in ('Dipesan', 'Berjalan')
        and new.tanggal_sewa <= r.tanggal_rencana_kembali
        and new.tanggal_rencana_kembali >= r.tanggal_sewa
    ) then
      raise exception 'Dress sudah disewa pada periode yang bertabrakan.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_prevent_overlap
before insert or update of id_dress, tanggal_sewa, tanggal_rencana_kembali, status_penyewaan
on public.rentals
for each row execute function public.prevent_overlapping_rentals();

-- =========================================================
-- INDEX
-- =========================================================
create index if not exists idx_dresses_status on public.dresses(status);
create index if not exists idx_dresses_kode on public.dresses(kode_dress);
create index if not exists idx_rentals_dates on public.rentals(tanggal_sewa, tanggal_rencana_kembali);
create index if not exists idx_rentals_status on public.rentals(status_penyewaan);
create index if not exists idx_rentals_customer on public.rentals(nama_pelanggan, no_telepon);
create index if not exists idx_payments_rental on public.payments(id_penyewaan, status_pembayaran);
create index if not exists idx_returns_rental on public.returns(id_penyewaan);

-- =========================================================
-- RPC: create_rental
-- =========================================================
create or replace function public.create_rental(
  p_id_dress uuid,
  p_nama_pelanggan text,
  p_no_telepon text,
  p_email text,
  p_alamat text,
  p_tanggal_sewa date,
  p_tanggal_rencana_kembali date,
  p_tarif_sewa numeric,
  p_total_sewa numeric,
  p_dp numeric default 0,
  p_kode text default null,
  p_dp_kode text default null
) returns public.rentals as $$
declare
  v_dress public.dresses;
  v_rental public.rentals;
begin
  select * into v_dress from public.dresses where id_dress = p_id_dress for update;
  if not found then raise exception 'Dress tidak ditemukan.'; end if;
  if v_dress.status <> 'Tersedia' then raise exception 'Dress tidak tersedia untuk disewakan.'; end if;
  if coalesce(p_dp, 0) < 0 or coalesce(p_dp, 0) > p_total_sewa then
    raise exception 'DP harus antara nol dan total sewa.';
  end if;

  insert into public.rentals (
    id_dress, kode_penyewaan, nama_pelanggan, no_telepon, email, alamat,
    tanggal_sewa, tanggal_rencana_kembali, tarif_sewa, total_sewa, status_penyewaan
  ) values (
    p_id_dress, coalesce(nullif(trim(p_kode), ''), public.generate_code('RNT', p_tanggal_sewa)),
    p_nama_pelanggan, p_no_telepon, p_email, p_alamat,
    p_tanggal_sewa, p_tanggal_rencana_kembali, p_tarif_sewa, p_total_sewa, 'Dipesan'
  ) returning * into v_rental;

  update public.dresses set status = 'Disewa' where id_dress = p_id_dress;

  if p_dp > 0 then
    insert into public.payments (
      id_penyewaan, kode_pembayaran, jenis_pembayaran, tanggal_bayar, jumlah_bayar,
      metode_pembayaran, status_pembayaran, total_tagihan_saat_bayar,
      total_dibayar_saat_bayar, sisa_tagihan_saat_bayar, status_tagihan_saat_bayar
    ) values (
      v_rental.id_penyewaan,
      coalesce(nullif(trim(p_dp_kode), ''), public.generate_code('PAY', current_date)),
      'DP', current_date, p_dp, 'Tunai', 'Berhasil',
      p_total_sewa, p_dp, greatest(p_total_sewa - p_dp, 0),
      case when p_dp >= p_total_sewa then 'LUNAS' else 'DP — PEMBAYARAN BELUM LUNAS' end
    );
    update public.rentals set status_penyewaan = 'Berjalan' where id_penyewaan = v_rental.id_penyewaan;
  end if;

  select * into v_rental from public.rentals where id_penyewaan = v_rental.id_penyewaan;
  return v_rental;
end;
$$ language plpgsql;

-- =========================================================
-- RPC: record_payment
-- =========================================================
create or replace function public.record_payment(
  p_id_penyewaan uuid,
  p_jenis text,
  p_tanggal_bayar date,
  p_jumlah numeric,
  p_metode text,
  p_referensi text,
  p_kode text default null,
  p_kategori_denda text default null
) returns public.payments as $$
declare
  v_rental public.rentals;
  v_total_paid numeric;
  v_sisa_tagihan numeric;
  v_total_paid_after numeric;
  v_balance_after numeric;
  v_status_snapshot text;
  v_payment public.payments;
  v_return public.returns;
  v_assessed_fine numeric;
  v_paid_fine numeric;
begin
  select * into v_rental from public.rentals where id_penyewaan = p_id_penyewaan for update;
  if not found then raise exception 'Penyewaan tidak ditemukan.'; end if;
  if v_rental.status_penyewaan = 'Dibatalkan' then
    raise exception 'Tidak dapat mencatat pembayaran pada transaksi yang dibatalkan.';
  end if;
  if p_jumlah <= 0 then raise exception 'Jumlah bayar harus lebih dari nol.'; end if;
  if p_jenis not in ('DP','Cicilan','Pelunasan','Denda') then
    raise exception 'Jenis pembayaran tidak valid.';
  end if;
  if p_jenis = 'Denda' and (
    p_kategori_denda is null or
    p_kategori_denda not in ('Keterlambatan', 'Kerusakan/Kehilangan')
  ) then
    raise exception 'Kategori denda wajib berupa Keterlambatan atau Kerusakan/Kehilangan.';
  end if;
  if p_jenis <> 'Denda' and p_kategori_denda is not null then
    raise exception 'Kategori denda hanya boleh diisi untuk pembayaran denda.';
  end if;
  if p_jenis = 'Denda' then
    select * into v_return
    from public.returns
    where id_penyewaan = p_id_penyewaan
    for update;
    if not found then
      raise exception 'Pembayaran denda hanya dapat dicatat setelah pengembalian dan penilaian denda.';
    end if;
    v_assessed_fine := case p_kategori_denda
      when 'Keterlambatan' then v_return.denda_keterlambatan
      when 'Kerusakan/Kehilangan' then v_return.denda_kerusakan
    end;
    select coalesce(sum(jumlah_bayar), 0) into v_paid_fine
    from public.payments
    where id_penyewaan = p_id_penyewaan
      and jenis_pembayaran = 'Denda'
      and kategori_denda = p_kategori_denda
      and status_pembayaran = 'Berhasil';
    if v_assessed_fine - v_paid_fine <= 0 then
      raise exception 'Denda kategori ini sudah lunas atau tidak dikenakan.';
    end if;
    if p_jumlah > v_assessed_fine - v_paid_fine then
      raise exception 'Pembayaran melebihi sisa denda kategori ini (%).', v_assessed_fine - v_paid_fine;
    end if;
  end if;

  select coalesce(sum(jumlah_bayar),0) into v_total_paid
  from public.payments
  where id_penyewaan = p_id_penyewaan
    and status_pembayaran = 'Berhasil'
    and jenis_pembayaran <> 'Denda';

  v_sisa_tagihan := greatest(v_rental.total_sewa - v_total_paid, 0);

  if p_jenis <> 'Denda' then
    if v_sisa_tagihan <= 0 then
      raise exception 'Tagihan sewa sudah lunas.';
    end if;
    if p_jumlah > v_sisa_tagihan then
      raise exception 'Pembayaran melebihi sisa tagihan.';
    end if;
    if p_jenis = 'Pelunasan' and p_jumlah <> v_sisa_tagihan then
      raise exception 'Nominal pelunasan harus sama dengan sisa tagihan (%).', v_sisa_tagihan;
    end if;
  end if;

  v_total_paid_after := v_total_paid + case when p_jenis = 'Denda' then 0 else p_jumlah end;
  v_balance_after := greatest(v_rental.total_sewa - v_total_paid_after, 0);
  v_status_snapshot := case
    when v_balance_after = 0 then 'LUNAS'
    when p_jenis = 'DP' then 'DP — PEMBAYARAN BELUM LUNAS'
    when v_total_paid > 0 then 'CICILAN — PEMBAYARAN BELUM LUNAS'
    else 'PEMBAYARAN BELUM LUNAS'
  end;

  insert into public.payments (
    id_penyewaan, kode_pembayaran, jenis_pembayaran, kategori_denda, tanggal_bayar, jumlah_bayar,
    metode_pembayaran, referensi, status_pembayaran, total_tagihan_saat_bayar,
    total_dibayar_saat_bayar, sisa_tagihan_saat_bayar, status_tagihan_saat_bayar
  ) values (
    p_id_penyewaan, coalesce(nullif(trim(p_kode), ''), public.generate_code('PAY', p_tanggal_bayar)),
    p_jenis, p_kategori_denda, p_tanggal_bayar, p_jumlah, p_metode, p_referensi, 'Berhasil',
    v_rental.total_sewa, v_total_paid_after, v_balance_after, v_status_snapshot
  ) returning * into v_payment;

  if p_jenis <> 'Denda' and v_rental.status_penyewaan = 'Dipesan' then
    update public.rentals set status_penyewaan = 'Berjalan' where id_penyewaan = p_id_penyewaan;
  end if;

  return v_payment;
end;
$$ language plpgsql;

-- =========================================================
-- RPC: cancel_payment
-- =========================================================
create or replace function public.cancel_payment(
  p_id_pembayaran uuid,
  p_alasan text
) returns public.payments as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id_pembayaran = p_id_pembayaran for update;
  if not found then raise exception 'Pembayaran tidak ditemukan.'; end if;
  if v_payment.status_pembayaran = 'Dibatalkan' then
    raise exception 'Pembayaran sudah dibatalkan.';
  end if;
  update public.payments
  set status_pembayaran = 'Dibatalkan', alasan_batal = p_alasan
  where id_pembayaran = p_id_pembayaran
  returning * into v_payment;
  return v_payment;
end;
$$ language plpgsql;

-- =========================================================
-- RPC: cancel_rental
-- =========================================================
create or replace function public.cancel_rental(
  p_id_penyewaan uuid,
  p_alasan text
) returns public.rentals as $$
declare
  v_rental public.rentals;
begin
  select * into v_rental from public.rentals where id_penyewaan = p_id_penyewaan for update;
  if not found then raise exception 'Penyewaan tidak ditemukan.'; end if;
  if v_rental.status_penyewaan = 'Selesai' then
    raise exception 'Penyewaan yang sudah selesai tidak dapat dibatalkan.';
  end if;
  if v_rental.status_penyewaan = 'Dibatalkan' then
    raise exception 'Penyewaan sudah dibatalkan.';
  end if;
  if exists (select 1 from public.returns where id_penyewaan = p_id_penyewaan) then
    raise exception 'Penyewaan tidak dapat dibatalkan karena sudah ada pengembalian.';
  end if;

  update public.rentals
  set status_penyewaan = 'Dibatalkan', alasan_batal = p_alasan
  where id_penyewaan = p_id_penyewaan
  returning * into v_rental;

  update public.dresses set status = 'Tersedia' where id_dress = v_rental.id_dress;
  return v_rental;
end;
$$ language plpgsql;

-- =========================================================
-- RPC: record_return
-- =========================================================
create or replace function public.record_return(
  p_id_penyewaan uuid,
  p_tanggal_kembali date,
  p_kondisi text,
  p_denda_telat numeric,
  p_denda_rusak numeric,
  p_catatan text,
  p_kode text default null
) returns public.returns as $$
declare
  v_rental public.rentals;
  v_return public.returns;
  v_late integer;
  v_total numeric;
  v_new_status text;
begin
  select * into v_rental from public.rentals where id_penyewaan = p_id_penyewaan for update;
  if not found then raise exception 'Penyewaan tidak ditemukan.'; end if;
  if v_rental.status_penyewaan not in ('Dipesan', 'Berjalan') then
    raise exception 'Pengembalian hanya dapat dicatat untuk penyewaan aktif.';
  end if;
  if exists (select 1 from public.returns where id_penyewaan = p_id_penyewaan) then
    raise exception 'Pengembalian untuk transaksi ini sudah ada.';
  end if;
  if p_tanggal_kembali is null then
    raise exception 'Tanggal kembali aktual wajib diisi.';
  end if;
  if p_kondisi is null or p_kondisi not in ('Baik','Rusak','Hilang') then
    raise exception 'Kondisi dress tidak valid.';
  end if;
  if coalesce(p_denda_telat, 0) < 0 or coalesce(p_denda_rusak, 0) < 0 then
    raise exception 'Nominal denda tidak boleh negatif.';
  end if;
  if p_kode is not null and p_kode !~ '^RTN-[0-9]{6}-[0-9]{4}$' then
    raise exception 'Format kode pengembalian tidak valid.';
  end if;

  v_late := greatest(0, p_tanggal_kembali - v_rental.tanggal_rencana_kembali);
  v_total := coalesce(p_denda_telat,0) + coalesce(p_denda_rusak,0);

  insert into public.returns (
    id_penyewaan, kode_pengembalian, tanggal_kembali_aktual, kondisi_dress, hari_terlambat,
    denda_keterlambatan, denda_kerusakan, total_denda, catatan
  ) values (
    p_id_penyewaan, coalesce(nullif(trim(p_kode), ''), public.generate_code('RTN', p_tanggal_kembali)),
    p_tanggal_kembali, p_kondisi, v_late,
    coalesce(p_denda_telat,0), coalesce(p_denda_rusak,0), v_total, p_catatan
  ) returning * into v_return;

  update public.rentals set status_penyewaan = 'Selesai' where id_penyewaan = p_id_penyewaan;

  v_new_status := case p_kondisi
    when 'Baik' then 'Tersedia'
    when 'Rusak' then 'Rusak'
    else 'Hilang'
  end;

  update public.dresses set status = v_new_status where id_dress = v_rental.id_dress;
  return v_return;
end;
$$ language plpgsql;

-- =========================================================
-- VIEW: summary per rental
-- =========================================================
create view public.v_rental_summary with (security_invoker = on) as
 SELECT r.id_penyewaan,
    r.kode_penyewaan,
    r.nama_pelanggan,
    r.no_telepon,
    d.nama_dress,
    d.kode_dress,
    r.tanggal_sewa,
    r.tanggal_rencana_kembali,
    r.total_sewa,
    COALESCE(sum(
        CASE
            WHEN p.status_pembayaran = 'Berhasil'::text AND p.jenis_pembayaran <> 'Denda'::text THEN p.jumlah_bayar
            ELSE 0::numeric
        END), 0::numeric) AS total_dibayar,
    r.total_sewa - COALESCE(sum(
        CASE
            WHEN p.status_pembayaran = 'Berhasil'::text AND p.jenis_pembayaran <> 'Denda'::text THEN p.jumlah_bayar
            ELSE 0::numeric
        END), 0::numeric) AS sisa_tagihan,
        CASE
            WHEN COALESCE(sum(
            CASE
                WHEN p.status_pembayaran = 'Berhasil'::text AND p.jenis_pembayaran <> 'Denda'::text THEN p.jumlah_bayar
                ELSE 0::numeric
            END), 0::numeric) = 0::numeric THEN 'Belum Bayar'::text
            WHEN COALESCE(sum(
            CASE
                WHEN p.status_pembayaran = 'Berhasil'::text AND p.jenis_pembayaran <> 'Denda'::text THEN p.jumlah_bayar
                ELSE 0::numeric
            END), 0::numeric) >= r.total_sewa THEN 'Lunas'::text
            WHEN (EXISTS ( SELECT 1
               FROM payments p2
              WHERE p2.id_penyewaan = r.id_penyewaan AND p2.status_pembayaran = 'Berhasil'::text AND p2.jenis_pembayaran = 'DP'::text)) THEN 'DP'::text
            ELSE 'Cicilan'::text
        END AS status_pembayaran,
    r.status_penyewaan
   FROM rentals r
     LEFT JOIN dresses d ON d.id_dress = r.id_dress
     LEFT JOIN payments p ON p.id_penyewaan = r.id_penyewaan
  GROUP BY r.id_penyewaan, d.nama_dress, d.kode_dress;

-- Refresh PostgREST's function cache so RPC signature changes are visible.
grant execute on function public.generate_code(text, date) to anon, authenticated;
grant execute on function public.create_rental(uuid, text, text, text, text, date, date, numeric, numeric, numeric, text, text)
  to anon, authenticated;
grant execute on function public.record_payment(uuid, text, date, numeric, text, text, text, text)
  to anon, authenticated;
grant execute on function public.cancel_payment(uuid, text) to anon, authenticated;
grant execute on function public.cancel_rental(uuid, text) to anon, authenticated;
grant execute on function public.record_return(uuid, date, text, numeric, numeric, text, text)
  to anon, authenticated;
notify pgrst, 'reload schema';

-- =========================================================
-- SEED DATA OPSIONAL
-- =========================================================
-- insert into public.dresses (nama_dress, ukuran, warna, tarif_sewa)
-- values ('Dress Aster', 'M', 'Cream', 350000);