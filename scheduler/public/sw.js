// Service Worker แบบเรียบง่าย
// เป้าหมาย: ให้ติดตั้งเป็นแอปได้ และเปิดหน้าเว็บได้เร็ว
// สำคัญ: ไม่ cache ข้อมูลจาก Supabase เพื่อให้ตารางงานเป็นข้อมูลล่าสุดเสมอ

const CACHE = 'scheduler-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ข้อมูลจากฐานข้อมูล: ดึงสดเสมอ ห้าม cache
  if (url.hostname.endsWith('supabase.co')) return;

  // หน้าเว็บ: ลองเน็ตก่อน ถ้าเน็ตหลุดค่อยใช้ตัวที่เก็บไว้
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ไฟล์อื่น ๆ: ใช้ตัวที่เก็บไว้ก่อนเพื่อความเร็ว
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
