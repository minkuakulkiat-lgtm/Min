import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    'ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY\n' +
    'ถ้ารันในเครื่อง: สร้างไฟล์ .env แล้วใส่ค่าทั้งสอง\n' +
    'ถ้าอยู่บน Netlify: ใส่ใน Site settings > Environment variables'
  );
}

export const supabase = createClient(url || '', anonKey || '', {
  realtime: { params: { eventsPerSecond: 10 } },
});
