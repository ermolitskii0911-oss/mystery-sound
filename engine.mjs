export const RTP = 0.5;
export const UP_RTP = 0.8;
const MSK = 3 * 3600e3;

export const ITEMS = {
 s3: ['3 Stars', 3, 'stars'], s10: ['10 Stars', 10, 'stars'],
 heart: ['Сердце', 15, 'gift'], gift: ['Подарок', 25, 'gift'], rose: ['Роза', 25, 'gift'],
 cake: ['Торт', 50, 'gift'], flowers: ['Букет', 50, 'gift'], rocket: ['Ракета', 50, 'gift'],
 champagne: ['Шампанское', 50, 'gift'], pumpkin: ['Тыквенный мишка', 50, 'gift'],
 trophy: ['Кубок', 100, 'gift'], ring: ['Кольцо', 100, 'gift'], diamond: ['Алмаз', 100, 'gift'],
 n_ice: ['Ice Cream', 300, 'nft'], n_flamingo: ['Flamingo', 430, 'nft'], n_casserole: ['Casserole', 440, 'nft'],
 n_lantern: ['Lantern', 470, 'nft'], n_stick: ['Marshmallow', 480, 'nft'], n_torch: ['Torch', 490, 'nft'],
 n_backpack: ['Backpack', 499, 'nft'], n_dog: ['Rapper Dog', 550, 'nft'], n_liberty: ['Liberty', 571, 'nft'],
 ton1: ['1 TON', 190, 'ton'], ton2: ['2 TON', 380, 'ton'], ton5: ['5 TON', 950, 'ton'],
 ton10: ['10 TON', 1900, 'ton'], ton25: ['25 TON', 4750, 'ton'],
 prem: ['Telegram Premium', 1000, 'prem']
};

const NFTS = Object.keys(ITEMS).filter(k => ITEMS[k][2] === 'nft');

export const CASES = [
 { id: 'free', name: 'Бесплатный', price: 0, daily: true, color: '#34d399', tag: 'РАЗ В ДЕНЬ', fixed: [['s3', 20], ['s10', 60], ['heart', 20]] },
 { id: 'mini', name: 'Мини', price: 10, color: '#94a3b8', tag: 'СТАРТ', items: ['heart', 'gift', 'rose'] },
 { id: 'gifts', name: 'Подарки', price: 25, color: '#38bdf8', tag: 'GIFT', items: ['heart', 'gift', 'rose', 'cake', 'flowers', 'rocket'] },
 { id: 'start', name: 'Классика', price: 50, color: '#a78bfa', tag: 'HIT', items: ['gift', 'rose', 'cake', 'flowers', 'rocket', 'champagne', 'pumpkin', 'trophy', 'ring', 'diamond'] },
 { id: 'gold', name: 'Золотой', price: 100, color: '#fbbf24', tag: 'GOLD', items: ['trophy', 'ring', 'diamond', 'pumpkin', 'rocket', 'ton1', 'n_ice'] },
 { id: 'ton', name: 'TON', price: 150, color: '#2aa7ff', tag: 'TON', items: ['ton1', 'ton2', 'ton5', 'trophy', 'ring', 'diamond', 'n_ice'] },
 { id: 'excl', name: 'Эксклюзив', price: 250, color: '#f472b6', tag: 'NFT', items: NFTS.concat(['trophy', 'diamond']) },
 { id: 'nft', name: 'NFT', price: 500, color: '#fb923c', tag: 'NFT', items: NFTS.concat(['ton2', 'ton5', 'prem']) },
 { id: 'myth', name: 'Мифический', price: 1500, color: '#e879f9', tag: 'MYTHIC', items: NFTS.concat(['ton5', 'ton10', 'ton25', 'prem']) }
];

const cache = {};

export function poolOf(c) {
 if (cache[c.id]) return cache[c.id];
 let pool;
 if (c.fixed) pool = c.fixed.map(f => ({ k: f[0], w: f[1] }));
 else {
 let q = 1, W = 1, sk = 1;
 for (; sk >= -0.001; sk -= 0.1) {
 W = 0; let S = 0;
 c.items.forEach(k => { const w = Math.pow(ITEMS[k][1], -sk); W += w; S += ITEMS[k][1] * w; });
 q = RTP * c.price * W / S; if (q <= 0.85) break;
 }
 q = Math.min(q, 0.85);
 W = c.items.reduce((a, k) => a + Math.pow(ITEMS[k][1], -sk), 0);
 pool = c.items.map(k => ({ k, w: Math.pow(ITEMS[k][1], -sk) / W * q * 100 }));
 pool.push({ k: 'empty', w: (1 - q) * 100 });
 }
 return (cache[c.id] = pool);
}

export function pick(pool, rnd) {
 const r = rnd() * 100; let a = 0;
 for (const p of pool) { a += p.w; if (r < a) return p.k; }
 return pool[pool.length - 1].k;
}

export const caseById = id => CASES.find(c => c.id === id);
export const valueOf = k => (ITEMS[k] ? ITEMS[k][1] : 0);
export function newState() { return { bal: 0, items: [], hist: [], free: '', n: 0 }; }
export const dayKey = now => new Date(now + MSK).toISOString().slice(0, 10);
export const nextReset = now => Date.parse(dayKey(now) + 'T00:00:00Z') - MSK + 86400e3;
const uid = (st, now) => 'i' + (++st.n) + '_' + now.toString(36);
const log = (st, o) => { st.hist.unshift(o); if (st.hist.length > 150) st.hist.length = 150; };

export function applySpin(st, id, rnd, now) {
 const c = caseById(id); if (!c) return { error: 'NO_CASE' };
 if (c.daily) {
 if (st.free === dayKey(now)) return { error: 'FREE_USED', next: nextReset(now) };
 st.free = dayKey(now);
 } else {
 if (st.bal < c.price) return { error: 'NO_BALANCE', need: c.price };
 st.bal -= c.price;
 }
 const k = pick(poolOf(c), rnd); let item = null;
 if (k !== 'empty') {
 if (ITEMS[k][2] === 'stars') st.bal += ITEMS[k][1];
 else { item = { id: uid(st, now), k, t: now, c: id }; st.items.push(item); }
 }
 log(st, { t: now, c: id, k, p: c.price });
 return { k, item, bal: st.bal };
}

export function applySell(st, itemId) {
 const i = st.items.findIndex(x => x.id === itemId); if (i < 0) return { error: 'NO_ITEM' };
 if (st.items[i].claim) return { error: 'CLAIMED' };
 st.bal += ITEMS[st.items[i].k][1]; st.items.splice(i, 1); return { bal: st.bal };
}

export function applyClaim(st, itemId, now) {
 const it = st.items.find(x => x.id === itemId); if (!it) return { error: 'NO_ITEM' };
 if (!it.claim) it.claim = now; return { item: it };
}

export function upChance(srcV, tgtV) { return UP_RTP * srcV / tgtV; }
export function upTargets(srcV) {
 return Object.keys(ITEMS).filter(k => ITEMS[k][2] !== 'stars').map(k => ({ k, v: ITEMS[k][1], ch: upChance(srcV, ITEMS[k][1]) }))
 .filter(t => t.v > srcV * 1.15 && t.ch >= 0.01 && t.ch <= 0.75).sort((a, b) => a.v - b.v);
}

export function applyUpgrade(st, src, tk, rnd, now) {
 if (!ITEMS[tk] || ITEMS[tk][2] === 'stars') return { error: 'BAD_TARGET' };
 let value, taken = null;
 if (src.type === 'bal') {
 value = Math.floor(Number(src.amount));
 if (!(value >= 10) || value > st.bal) return { error: 'NO_BALANCE', need: value };
 } else {
 const i = st.items.findIndex(x => x.id === src.id); if (i < 0) return { error: 'NO_ITEM' };
 if (st.items[i].claim) return { error: 'CLAIMED' };
 value = ITEMS[st.items[i].k][1]; taken = i;
 }
 const tv = ITEMS[tk][1], ch = upChance(value, tv);
 if (tv <= value * 1.15 || ch < 0.01 || ch > 0.75) return { error: 'BAD_CHANCE' };
 if (taken === null) st.bal -= value; else st.items.splice(taken, 1);
 const u = rnd(), win = u < ch; let item = null;
 if (win) { item = { id: uid(st, now), k: tk, t: now, c: 'up' }; st.items.push(item); }
 log(st, { t: now, c: 'up', k: win ? tk : 'empty', p: value });
 return { win, u, ch, item, bal: st.bal };
}
