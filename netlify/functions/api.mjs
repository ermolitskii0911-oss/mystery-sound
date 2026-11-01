import crypto from 'node:crypto';
import * as E from '../../engine.mjs';

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const srnd = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

export function verify(initData, token, now = Date.now()) {
 const p = new URLSearchParams(initData || ''); const hash = p.get('hash'); if (!hash) return null; p.delete('hash');
 const dcs = [...p.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
 const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
 const h = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
 if (h.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash))) return null;
 if (now / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
 try { return JSON.parse(p.get('user')); } catch { return null; }
}

export function makeHandler({ store, env, tg, now = () => Date.now(), rnd = srnd }) {
 const token = env.BOT_TOKEN;
 const call = tg || (async (m, b) => (await fetch(`https://telegram.org{token}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json());
 const owner = text => env.OWNER_ID ? call('sendMessage', { chat_id: env.OWNER_ID, text }).catch(() => {}) : null;
 const load = async id => (await store.get('u_' + id, { type: 'json' })) || E.newState();
 const save = (id, st) => store.setJSON('u_' + id, st);
 const pub = st => ({ bal: st.bal, items: st.items, hist: st.hist.slice(0, 60), free: st.free, next: E.nextReset(now()) });
 const chain = new Map();
 const locked = async (id, fn) => {
 const prev = chain.get(id) || Promise.resolve(); let done; const cur = new Promise(r => (done = r));
 chain.set(id, prev.then(() => cur)); await prev;
 try { return await fn(); } finally { done(); }
 };
 const mask = u => ((u.first_name || u.username || 'Игрок').slice(0, 2) + '***');
 const addFeed = async (u, k) => {
 const feed = (await store.get('feed', { type: 'json' })) || [];
 feed.unshift({ n: mask(u), k, t: now() }); feed.length = Math.min(feed.length, 30); await store.setJSON('feed', feed);
 };
 return async req => {
 const url = new URL(req.url); const route = url.pathname.replace(/^.*\/api\//, '');
 if (!token) return J({ error: 'NO_TOKEN' }, 500);
 try {
 if (route === 'feed') return J((await store.get('feed', { type: 'json' })) || []);
 if (route === 'setup') {
 const site = (env.URL || url.origin).replace(/\/$/, '');
 const a = await call('setWebhook', { url: site + '/api/webhook', secret_token: sha(token).slice(0, 40), allowed_updates: ['message', 'pre_checkout_query'] });
 const b = await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: site } } });
 await store.setJSON('meta', { site });
 return new Response(`<meta charset="utf-8"><body style="font:18px sans-serif;padding:30px;background:#0b1030;color:#fff"><h2>${a.ok && b.ok ? ' Готово! Бот подключён.' : ' What-то не так'}</h2><pre>${JSON.stringify({ webhook: a, menu: b }, null, 2)}</pre><p>Откройте бота в Telegram и отправьте /start</p>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
 }
 if (route === 'webhook') {
 if (req.headers.get('x-telegram-bot-api-secret-token') !== sha(token).slice(0, 40)) return J({ error: 'FORBIDDEN' }, 403);
 const up = await req.json();
 if (up.pre_checkout_query) {
 const q = up.pre_checkout_query;
 const ok = q.currency === 'XTR' && String(q.invoice_payload || '').startsWith('topup:');
 await call('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Платёж не распознан' });
 } else if (up.message && up.message.successful_payment) {
 const sp = up.message.successful_payment, uid = up.message.from.id, cid = 'ch_' + sp.telegram_payment_charge_id.replace(/[^\w-]/g, '_');
 await locked(uid, async () => {
 if (await store.get(cid)) return;
 await store.set(cid, '1');
 const st = await load(uid); st.bal += sp.total_amount; await save(uid, st);
 await call('sendMessage', { chat_id: uid, text: ` Баланс пополнен на ${sp.total_amount} ` });
 await owner(` Пополнение: ${sp.total_amount} от ${uid} (@${up.message.from.username || '—'})`);
 });
 } else if (up.message && /^\/start/.test(up.message.text || '')) {
 const meta = (await store.get('meta', { type: 'json' })) || {}; const site = env.URL || meta.site;
 await call('sendMessage', { chat_id: up.message.chat.id, text: ' Добро пожаловать в Mystery Hub!\nКейсы, NFT и подарки Telegram. Нажми кнопку ниже.', reply_markup: { inline_keyboard: [[{ text: ' Открыть Mystery Hub', web_app: { url: site } }]] } });
 }
 return J({ ok: true });
 }
 const user = verify(req.headers.get('x-init-data'), token, now());
 if (!user) return J({ error: 'AUTH' }, 401);
 const id = user.id; const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
 if (route === 'invoice') {
 const n = Math.floor(Number(body.amount));
 if (!(n >= 10 && n <= 10000)) return J({ error: 'BAD_AMOUNT' }, 400);
 const r = await call('createInvoiceLink', { title: 'Пополнение Mystery Hub', description: `${n} на баланс`, payload: `topup:${id}:${n}:${now()}`, provider_token: '', currency: 'XTR', prices: [{ label: 'Звёзды', amount: n }] });
 return r.ok ? J({ link: r.result }) : J({ error: 'INVOICE', detail: r }, 502);
 }
 return await locked(id, async () => {
 const st = await load(id); let res;
 if (route === 'state') res = {};
 else if (route === 'spin') {
 res = E.applySpin(st, String(body.c), rnd, now());
 if (res.item && (E.ITEMS[res.k][2] === 'nft' || E.ITEMS[res.k][1] >= 100)) await addFeed(user, res.k);
 if (res.item && E.ITEMS[res.k][2] === 'nft') await owner(` NFT выпал: ${E.ITEMS[res.k][0]} — ${id} (@${user.username || '—'})`);
 } else if (route === 'sell') res = E.applySell(st, String(body.id));
 else if (route === 'claim') {
 res = E.applyClaim(st, String(body.id), now());
 if (res.item) await owner(` ЗАЯВКА НА ВЫВОД: ${E.ITEMS[res.item.k][0]} (${E.ITEMS[res.item.k][1]} ) — игрок ${id} (@${user.username || '—'})`);
 } else if (route === 'upgrade') {
 res = E.applyUpgrade(st, body.src || {}, String(body.t), rnd, now());
 if (res.win && E.ITEMS[body.t][2] === 'nft') { await addFeed(user, body.t); await owner(` NFT из апгрейда: ${E.ITEMS[body.t][0]} — ${id}`); }
 } else return J({ error: 'NO_ROUTE' }, 404);
 await save(id, st);
 return J({ ...res, state: pub(st), name: user.first_name || user.username || '' });
 });
 } catch (e) { return J({ error: 'SERVER', detail: String(e && e.message || e) }, 500); }
 };
}

export default async req => {
 const { getStore } = await import('@netlify/blobs');
 return makeHandler({ store: getStore('mysteryhub'), env: process.env })(req);
};
export const config = { path: '/api/*' };
