-- ============================================================
-- สคริปต์ตั้งค่าฐานข้อมูลสำหรับระบบตารางงาน
-- วิธีใช้: เปิด Supabase > SQL Editor > New query > วางทั้งหมดนี้ > กด Run
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
-- ============================================================

-- ---------- ตารางทีมงาน ----------
create table if not exists public.staff (
  id          text primary key,
  name        text not null,
  role        text not null default 'Setup',
  phone       text default '',
  headcount   integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- ตารางงาน ----------
create table if not exists public.jobs (
  id                  text primary key,
  name                text not null,
  client              text default '',
  location            text default '',
  map_url             text default '',
  status              text not null default 'รอยืนยัน',
  color               text default '',
  assigned_staff_ids  jsonb not null default '[]'::jsonb,
  phases              jsonb not null default '[]'::jsonb,
  daily_overrides     jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- อัปเดตเวลาแก้ไขล่าสุดอัตโนมัติ ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_jobs_updated on public.jobs;
create trigger trg_jobs_updated before update on public.jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_staff_updated on public.staff;
create trigger trg_staff_updated before update on public.staff
  for each row execute function public.touch_updated_at();

-- ---------- เปิด Realtime (ให้ทุกคนเห็นการเปลี่ยนแปลงทันที) ----------
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.staff;

-- ---------- สิทธิ์การเข้าถึง ----------
-- หมายเหตุสำคัญเรื่องความปลอดภัย:
-- ระบบนี้ไม่มีระบบล็อกอิน จึงต้องเปิดให้ผู้ใช้ทั่วไป (anon) อ่าน/เขียนได้
-- แปลว่า "ใครก็ตามที่รู้ลิงก์เว็บ สามารถดูและแก้ตารางงานได้"
-- เหมาะกับการใช้ภายในบริษัทที่ไว้ใจกันเท่านั้น อย่าเผยแพร่ลิงก์สู่สาธารณะ
-- ถ้าต้องการความปลอดภัยมากขึ้น ให้เพิ่มระบบล็อกอินของ Supabase ภายหลัง

alter table public.jobs  enable row level security;
alter table public.staff enable row level security;

drop policy if exists "เปิดให้ทุกคนใช้งาน jobs"  on public.jobs;
drop policy if exists "เปิดให้ทุกคนใช้งาน staff" on public.staff;

create policy "เปิดให้ทุกคนใช้งาน jobs"
  on public.jobs for all
  to anon, authenticated
  using (true) with check (true);

create policy "เปิดให้ทุกคนใช้งาน staff"
  on public.staff for all
  to anon, authenticated
  using (true) with check (true);

-- ---------- ตรวจสอบผลลัพธ์ ----------
select 'ตั้งค่าเสร็จเรียบร้อย' as สถานะ,
       (select count(*) from public.jobs)  as จำนวนงาน,
       (select count(*) from public.staff) as จำนวนทีมงาน;
