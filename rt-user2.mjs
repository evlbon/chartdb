import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const anon = readFileSync('/tmp/chartdb_anon_key', 'utf8').trim();
const supabase = createClient('https://ifelyookwubbinlpupqw.supabase.co', anon);
await supabase.auth.signInWithPassword({ email: 'test-e2e2@example.com', password: 'test123456' });
await supabase.realtime.setAuth();
const uid = '095ced52-69ed-4355-8b7d-5b2330870477';
const ch = supabase.channel('diagram:nuzrh0bj9ktu', { config: { private: true, presence: { key: uid } } });
let cursorCount = 0;
ch.on('presence', { event: 'sync' }, () => {
  const emails = Object.values(ch.presenceState()).flat().map(p => p.email);
  console.log('PRESENCE:', JSON.stringify(emails));
});
ch.on('broadcast', { event: 'cursor' }, ({ payload }) => {
  cursorCount++;
  if (cursorCount <= 2) console.log('CURSOR:', JSON.stringify(payload));
});
ch.subscribe(async (status) => {
  console.log('STATUS:', status);
  if (status === 'SUBSCRIBED') {
    await ch.track({ userId: uid, email: 'test-e2e2@example.com', color: 'hsl(200, 70%, 45%)', joinedAt: Date.now() });
    // send a cursor into the diagram so the browser side can render it
    setInterval(() => {
      ch.send({ type: 'broadcast', event: 'cursor', payload: { userId: uid, email: 'test-e2e2@example.com', color: 'hsl(200, 70%, 45%)', x: 300 + Math.sin(Date.now()/500)*100, y: 200 } });
    }, 100);
  }
});
setTimeout(() => { console.log('TOTAL CURSORS RECEIVED:', cursorCount); process.exit(0); }, 25000);
