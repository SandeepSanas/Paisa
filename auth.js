// Paisa: sign-in, per-user cloud sync (Firestore), market feeds from the Paisa server, push notifications and app updates.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

// Firebase web config is public by design; access is protected by Firestore rules and sign-in.
const firebaseConfig = {
  apiKey: 'AIzaSyATsnZaOcBWxa_Kz8nbvGq2D5Hhd3a9HEY',
  authDomain: 'paisa-95df7.firebaseapp.com',
  projectId: 'paisa-95df7',
  storageBucket: 'paisa-95df7.firebasestorage.app',
  messagingSenderId: '948947665726',
  appId: '1:948947665726:web:b9cfbe18a916a657dfe26f'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window.__fbReady = true;

const $ = id => document.getElementById(id);
const MAIN_KEYS = ['pt.cfg','pt.watch','pt.n50cfg','pt.icol','pt.ovl','pt.zoom','pt.lab','pt.palerts','pt.olock','pt.draw','pt.macdp','pt.sbpos','pt.pbook','pt.pledg','pt.logclr'];
const LOG_KEYS = ['pt.log','pt.lablog'];
let cur = null, dirtyMain = false, dirtyLogs = false, tMain = null, tLogs = null, pushing = false;
const last = { main: '', logs: '', secrets: '' };

/* ---------------- login screen ---------------- */
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.1 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const eye = $('lgEye'), pass = $('lgPass'), email = $('lgEmail');
eye.innerHTML = EYE;
eye.onclick = () => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; eye.innerHTML = show ? EYE_OFF : EYE;
  eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); pass.focus(); };
function msg(t, ok) { const m = $('lgMsg'); m.textContent = t || ''; m.className = 'lg-msg' + (ok ? ' ok' : ''); }
function state(t) { $('lgState').hidden = !t; $('lgFields').hidden = !!t; if (t) $('lgStateTx').textContent = t; }
function clearForm() { email.value = ''; pass.value = ''; pass.type = 'password'; eye.innerHTML = EYE; eye.setAttribute('aria-pressed', 'false'); }
const ERR = {
  'auth/invalid-credential': 'Email or password is incorrect.', 'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.', 'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.', 'auth/network-request-failed': 'No internet connection. Check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact the admin.'
};
$('lgForm').addEventListener('submit', async e => {
  e.preventDefault(); msg('');
  const em = email.value.trim(), pw = pass.value;
  if (!em || !pw) { msg('Enter your email and password.'); return; }
  const btn = $('lgGo'); btn.disabled = true; btn.textContent = 'Signing in…';
  try { await signInWithEmailAndPassword(auth, em, pw); }
  catch (err) { msg(ERR[err.code] || 'Sign-in failed. Try again.'); btn.disabled = false; btn.textContent = 'Sign in'; }
});
$('lgForgot').onclick = async () => {
  const em = email.value.trim(); if (!em) { msg('Type your email above first, then tap Forgot password.'); email.focus(); return; }
  try { await sendPasswordResetEmail(auth, em); msg('If an account exists for that email, a reset link has been sent.', true); }
  catch (err) { msg(ERR[err.code] || 'Could not send the reset email. Try again.'); }
};

/* ---------------- local data helpers ---------------- */
function clearLocal() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('pt.')) localStorage.removeItem(k); } catch (e) {}
  try { sessionStorage.removeItem('pt.synced'); } catch (e) {}
}
const ref = (uid, a, b) => doc(db, 'users', uid, a, b);
function splitCfg(raw) { let c = {}; try { c = JSON.parse(raw || '{}') || {}; } catch (e) {}
  const sec = { token: c.token || '', fkey: c.fkey || '' }; delete c.token; delete c.fkey; return { cfg: JSON.stringify(c), sec }; }

/* signal log, paper results and bookings are merged (not overwritten), so every device shows the same trades */
const J = (raw, d) => { try { const v = JSON.parse(raw); return v == null ? d : v; } catch (e) { return d; } };
function mergeRows(a, b, clr) { const m = new Map(); for (const x of [...a, ...b]) { if (!x || !x.id || (clr && x.t <= clr)) continue; const o = m.get(x.id);
    if (!o || (o.r == null && x.r != null)) m.set(x.id, o ? { ...o, ...x } : x); } return [...m.values()].sort((p, q) => (p.t || 0) - (q.t || 0)); }
function mergeInto(k, remoteRaw) { if (typeof remoteRaw !== 'string') return; const loc = localStorage.getItem(k);
  if (k === 'pt.logclr') { localStorage.setItem(k, String(Math.max(+J(loc, 0) || 0, +J(remoteRaw, 0) || 0))); return; }
  if (k === 'pt.pbook') { localStorage.setItem(k, JSON.stringify({ ...J(remoteRaw, {}), ...J(loc, {}) })); return; }
  const clr = k === 'pt.log' ? +J(localStorage.getItem('pt.logclr'), 0) || 0 : 0;
  localStorage.setItem(k, JSON.stringify(mergeRows(J(loc, []), J(remoteRaw, []), clr))); }
const MERGE_KEYS = ['pt.log', 'pt.pledg', 'pt.pbook', 'pt.logclr'];
let liveUnsubs = [];
function liveSync(uid) { stopLive();
  const hand = (k, raw) => { if (typeof raw !== 'string' || !window.paisaMerge) return; const v = J(raw, null); if (v == null) return;
    try { window.paisaMerge(k === 'pt.log' ? { log: v } : k === 'pt.pledg' ? { pledg: v } : k === 'pt.pbook' ? { pbook: v } : { logclr: v }); } catch (e) {} };
  liveUnsubs.push(onSnapshot(ref(uid, 'state', 'logs'), s => { if (s.exists()) hand('pt.log', s.data()['pt.log']); }, () => {}));
  liveUnsubs.push(onSnapshot(ref(uid, 'state', 'main'), s => { if (!s.exists()) return; const d = s.data().data || {}; for (const k of ['pt.logclr', 'pt.pledg', 'pt.pbook']) hand(k, d[k]); }, () => {})); }
function stopLive() { for (const u of liveUnsubs) try { u(); } catch (e) {} liveUnsubs = []; }

async function pull(uid) {
  const [m, l, s] = await Promise.all([getDoc(ref(uid, 'state', 'main')), getDoc(ref(uid, 'state', 'logs')), getDoc(ref(uid, 'private', 'secrets'))]);
  if (!m.exists()) return false;
  const d = m.data().data || {};
  for (const k of MAIN_KEYS) if (typeof d[k] === 'string') { if (MERGE_KEYS.includes(k)) mergeInto(k, d[k]); else localStorage.setItem(k, d[k]); }
  if (l.exists()) { const x = l.data(); for (const k of LOG_KEYS) if (typeof x[k] === 'string') { if (k === 'pt.log') mergeInto(k, x[k]); else localStorage.setItem(k, x[k]); } }
  let c = {}; try { c = JSON.parse(localStorage.getItem('pt.cfg') || '{}') || {}; } catch (e) {}
  if (s.exists()) { const x = s.data(); c.token = x.token || ''; c.fkey = x.fkey || ''; }
  localStorage.setItem('pt.cfg', JSON.stringify(c));
  localStorage.setItem('pt.syncAt', String(m.data().updatedAt || Date.now()));
  return true;
}

function capJSON(raw, n) { try { const a = JSON.parse(raw || '[]'); return JSON.stringify(Array.isArray(a) ? a.slice(-n) : []); } catch (e) { return '[]'; } }
async function push(full) {
  if (!cur || pushing) return; pushing = true; const uid = cur.uid; const now = Date.now();
  try {
    try { const [rm, rl] = await Promise.all([getDoc(ref(uid, 'state', 'main')), (full || dirtyLogs) ? getDoc(ref(uid, 'state', 'logs')) : null]);
      const rd = rm.exists() ? rm.data().data || {} : {}; const rx = rl && rl.exists() ? rl.data() : {};
      if (window.paisaMerge) window.paisaMerge({ logclr: J(rd['pt.logclr'], 0), pledg: J(rd['pt.pledg'], null), pbook: J(rd['pt.pbook'], null), log: J(rx['pt.log'], null) });
      else { for (const k of ['pt.logclr', 'pt.pledg', 'pt.pbook']) mergeInto(k, rd[k]); mergeInto('pt.log', rx['pt.log']); } } catch (e) {}
    const data = {}; let sec = { token: '', fkey: '' };
    for (const k of MAIN_KEYS) { const v = localStorage.getItem(k); if (v == null) continue;
      if (k === 'pt.cfg') { const s = splitCfg(v); data[k] = s.cfg; sec = s.sec; } else data[k] = v; }
    const mainStr = JSON.stringify(data);
    if (full || (dirtyMain && mainStr !== last.main)) { await setDoc(ref(uid, 'state', 'main'), { v: 1, updatedAt: now, data }); last.main = mainStr; localStorage.setItem('pt.syncAt', String(now)); }
    dirtyMain = false;
    const secStr = JSON.stringify(sec);
    if (full || secStr !== last.secrets) { await setDoc(ref(uid, 'private', 'secrets'), { ...sec, updatedAt: now }); last.secrets = secStr; }
    if (full || dirtyLogs) { const logs = { 'pt.log': capJSON(localStorage.getItem('pt.log'), 1200), 'pt.lablog': capJSON(localStorage.getItem('pt.lablog'), 1000) };
      const ls = JSON.stringify(logs); if (full || ls !== last.logs) { await setDoc(ref(uid, 'state', 'logs'), { ...logs, updatedAt: now }); last.logs = ls; } dirtyLogs = false; }
    const s = $('acSync'); if (s) s.textContent = 'Synced to your account at ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '.';
  } catch (err) {
    const s = $('acSync'); if (s) s.textContent = 'Sync failed (' + (err.code || err.message || err) + '). Your data is safe on this device and will sync when possible.';
  } finally { pushing = false; }
}
// called by the app every time it saves something; main settings sync within ~8 s, logs within ~60 s
window.syncMark = k => {
  if (!cur || !k || !k.startsWith('pt.')) return;
  if (LOG_KEYS.includes(k)) { dirtyLogs = true; if (!tLogs) tLogs = setTimeout(() => { tLogs = null; push(false); }, 60000); }
  else if (MAIN_KEYS.includes(k)) { dirtyMain = true; clearTimeout(tMain); tMain = setTimeout(() => push(false), 8000); }
};
document.addEventListener('visibilitychange', async () => {
  if (!cur) return;
  if (document.visibilityState === 'hidden') { if (dirtyMain || dirtyLogs) push(false); return; }
  // back in front: has another device saved newer settings?
  try { const m = await getDoc(ref(cur.uid, 'state', 'main')); const t = m.exists() ? (m.data().updatedAt || 0) : 0;
    if (t > Number(localStorage.getItem('pt.syncAt') || 0) + 1000 && !dirtyMain) { sessionStorage.removeItem('pt.synced'); window.appToast && window.appToast('Updated on another device', 'Close and reopen TradeBot (or reload) to load those changes.', 9000); } } catch (e) {}
});

/* ---------------- account panel ---------------- */
let outArm = 0;
function wireAccount(u) {
  const who = $('acWho'); if (who) who.innerHTML = 'Signed in as <b>' + (u.email || '').replace(/[<>&]/g, '') + '</b>';
  const sn = $('acSyncNow'); if (sn) sn.onclick = async () => { $('acMsg').className = 'msg'; $('acMsg').textContent = 'Syncing…'; await push(true); $('acMsg').className = 'msg ok'; $('acMsg').textContent = 'Done'; };
  const out = $('acOut'); if (out) out.onclick = async () => {
    if (Date.now() - outArm > 4000) { outArm = Date.now(); out.textContent = 'Tap again to sign out'; setTimeout(() => out.textContent = 'Sign out', 4000); return; }
    out.disabled = true; out.textContent = 'Signing out…';
    try { await push(false); } catch (e) {}
    try { await dropDevice(); } catch (e) {}
    stopFeeds(); stopLive(); algoStop();
    try { await signOut(auth); } catch (e) {}
    clearLocal(); clearForm(); location.reload();
  };
}

/* ---------------- market feeds written by the Paisa server ---------------- */
const FEEDS = ['swing', 'fii', 'futures', 'signals', 'news', 'releases', 'calendar', 'macro', 'moves', 'nse', 'status', 'config'];
window.FEED = window.FEED || {};
let unsubs = [];
function startFeeds() {
  if (unsubs.length) return;
  for (const n of FEEDS) unsubs.push(onSnapshot(doc(db, 'feed', n), snap => {
    window.FEED[n] = snap.exists() ? snap.data() : null; window.FEED.err = null;
    window.dispatchEvent(new CustomEvent('paisa-feed', { detail: n }));
  }, err => { window.FEED.err = err.code || err.message; window.dispatchEvent(new CustomEvent('paisa-feed', { detail: 'err' })); }));
}
function stopFeeds() { for (const u of unsubs) try { u(); } catch (e) {} unsubs = []; try { window.paisaLab(false); } catch (e) {} }
// Options Lab feeds: listened to only while the Lab tab is open (the history list can be large)
let labUnsubs = [];
window.paisaLab = on => {
  if (!on) { for (const u of labUnsubs) try { u(); } catch (e) {} labUnsubs = []; return; }
  if (labUnsubs.length || !unsubs.length) return;
  for (const n of ['lab', 'labhist', 'labx', 'labhistx', 'condor', 'condorhist', 'kronos', 'kronoshist']) labUnsubs.push(onSnapshot(doc(db, 'feed', n), snap => { window.FEED[n] = snap.exists() ? snap.data() : null; window.dispatchEvent(new CustomEvent('paisa-feed', { detail: n })); }, () => {}));
};

/* ---------------- push notifications ---------------- */
const DEV_KEY = 'pt.dev';
const devInfo = () => { try { return JSON.parse(localStorage.getItem(DEV_KEY) || 'null'); } catch (e) { return null; } };
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join(''); }
let msgMod = null;
async function messaging() {
  if (!msgMod) { const m = await import(SDK + 'firebase-messaging.js'); if (!(await m.isSupported())) throw new Error('unsupported'); msgMod = { m, inst: m.getMessaging(app) }; }
  return msgMod;
}
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function vapidKey() {
  if (window.FEED.config && window.FEED.config.vapid) return window.FEED.config.vapid;
  const d = await getDoc(doc(db, 'feed', 'config')); return d.exists() ? d.data().vapid : '';
}
window.paisaPush = {
  info() {
    const d = devInfo();
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return { state: isIOS && !standalone ? 'ios-home' : 'unsupported' };
    if (Notification.permission === 'denied') return { state: 'blocked' };
    return { state: d && cur && d.uid === cur.uid && Notification.permission === 'granted' ? 'on' : 'off', prefs: d && d.prefs };
  },
  async enable(prefs) {
    if (!cur) throw new Error('Sign in first');
    if (isIOS && !standalone) throw new Error('On iPhone/iPad, add TradeBot to the Home Screen first, then open it from there.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error(p === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings.' : 'Permission was not given.');
    let mm; try { mm = await messaging(); } catch (e) { throw new Error('This browser does not support push notifications.'); }
    const key = await vapidKey(); if (!key) throw new Error('The server has not published its push key yet. Deploy the server, wait a minute, then try again.');
    const reg = await navigator.serviceWorker.ready;
    const token = await mm.m.getToken(mm.inst, { vapidKey: key, serviceWorkerRegistration: reg });
    if (!token) throw new Error('Could not get a push token. Try again.');
    const id = await sha(token);
    const old = devInfo(); if (old && old.uid === cur.uid && old.id !== id) { try { await deleteDoc(doc(db, 'users', cur.uid, 'devices', old.id)); } catch (e) {} }
    await setDoc(doc(db, 'users', cur.uid, 'devices', id), { token, prefs, ua: navigator.userAgent.slice(0, 160), updatedAt: Date.now() });
    localStorage.setItem(DEV_KEY, JSON.stringify({ id, uid: cur.uid, prefs, at: Date.now() }));
    return true;
  },
  async prefs(prefs) {
    const d = devInfo(); if (!d || !cur || d.uid !== cur.uid) return false;
    await setDoc(doc(db, 'users', cur.uid, 'devices', d.id), { prefs, updatedAt: Date.now() }, { merge: true });
    d.prefs = prefs; localStorage.setItem(DEV_KEY, JSON.stringify(d)); return true;
  },
  async disable() { await dropDevice(); try { const mm = await messaging(); await mm.m.deleteToken(mm.inst); } catch (e) {} },
  async test() { return call('test'); },
};
window.paisaRefresh = () => call('refresh');
// Upstox through the Paisa server (used only when the browser's own request is refused)
let upFn = null;
window.paisaUpstox = async (path, token) => {
  if (!upFn) { const f = await import(SDK + 'firebase-functions.js'); upFn = f.httpsCallable(f.getFunctions(app, 'asia-south1'), 'upstox', { timeout: 30000 }); }
  return (await upFn({ path, token: token || '' })).data;
};
// Symbol search through the Paisa server (fast on phones: no 37 MB download)
let symFn = null;
/* ---------------- AlgoBot: settings / commands / daily Upstox login (robot runs on the user's own server) ---------------- */
let algoUnsubs = [];
function algoStop() { for (const u of algoUnsubs) try { u(); } catch (e) {} algoUnsubs = []; }
function algoStart(uid) { algoStop();
  const on = (k, d) => { try { window.paisaAlgoOn && window.paisaAlgoOn(k, d); } catch (e) {} };
  for (const k of ['state', 'hist', 'settings', 'login']) algoUnsubs.push(onSnapshot(ref(uid, 'algo', k), s => on(k, s.exists() ? s.data() : null), () => on(k + 'Err', true)));
  // today's Upstox token from the robot's login: also used by the app for market data
  algoUnsubs.push(onSnapshot(ref(uid, 'private', 'upx'), s => { if (s.exists()) on('upx', s.data()); }, () => {}));
  // coming back from Upstox's login page: hand the one-time code to the robot
  try { const q = new URLSearchParams(location.search); if (q.get('state') === 'algobot' && q.get('code')) {
      setDoc(ref(uid, 'algo', 'login'), { code: q.get('code'), at: Date.now(), done: false }).catch(() => {});
      history.replaceState(null, '', location.pathname); sessionStorage.setItem('pt.openAlgo', '1'); } } catch (e) {}
}
window.paisaAlgo = {
  settings: async v => { if (!cur) throw new Error('Sign in first'); await setDoc(ref(cur.uid, 'algo', 'settings'), { ...v, updatedAt: Date.now() }); },
  cmd: async type => { if (!cur) throw new Error('Sign in first'); await setDoc(ref(cur.uid, 'algo', 'cmd'), { id: type + '-' + Date.now(), type, at: Date.now() }); },
};
window.paisaSearch = async q => {
  if (!symFn) { const f = await import(SDK + 'firebase-functions.js'); symFn = f.httpsCallable(f.getFunctions(app, 'asia-south1'), 'symbols', { timeout: 40000 }); }
  return (await symFn({ q })).data;
};
window.paisaMcxOpt = async n => {   // MCX option contract list for one commodity (strikes, CE/PE keys, underlying future)
  if (!symFn) { const f = await import(SDK + 'firebase-functions.js'); symFn = f.httpsCallable(f.getFunctions(app, 'asia-south1'), 'symbols', { timeout: 40000 }); }
  return (await symFn({ mcxopt: n })).data;
};
async function call(what) {
  const f = await import(SDK + 'firebase-functions.js');
  const fn = f.httpsCallable(f.getFunctions(app, 'asia-south1'), 'paisaAction', { timeout: 70000 });
  const r = await fn({ what }); return r.data;
}
async function dropDevice() {
  const d = devInfo(); localStorage.removeItem(DEV_KEY);
  if (d && cur && d.uid === cur.uid) await deleteDoc(doc(db, 'users', cur.uid, 'devices', d.id));
}
// tokens can rotate; refresh this device's registration about once a week
async function refreshDevice() {
  const d = devInfo(); if (!d || !cur || d.uid !== cur.uid || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (Date.now() - (d.at || 0) < 6 * 86400000) return;
  setTimeout(() => window.paisaPush.enable(d.prefs).catch(() => {}), 8000);
}
// a push arriving while Paisa is open: the service worker hands it over and the app shows a toast
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data; if (d && d.type === 'paisa-push') { window.appToast && window.appToast(d.title, d.body, 9000); window.dispatchEvent(new CustomEvent('paisa-push', { detail: d })); }
  if (d && d.type === 'paisa-open') window.dispatchEvent(new CustomEvent('paisa-open', { detail: d.url }));
});

/* ---------------- session flow ---------------- */
function start(u) { wireAccount(u); window.startApp && window.startApp(); startFeeds(); refreshDevice(); setTimeout(() => liveSync(u.uid), 3000); setTimeout(() => algoStart(u.uid), 1500); }
onAuthStateChanged(auth, async u => {
  if (!u) { cur = null; state(null); clearForm(); setTimeout(() => email.focus(), 300); return; }
  cur = u; msg(''); state('Loading your data…');
  try {
    const owner = localStorage.getItem('pt.owner');
    if (owner && owner !== u.uid) clearLocal();          // never show another person's data
    if (sessionStorage.getItem('pt.synced') === u.uid) { localStorage.setItem('pt.owner', u.uid); start(u); return; }
    const had = await pull(u.uid);
    localStorage.setItem('pt.owner', u.uid); sessionStorage.setItem('pt.synced', u.uid);
    if (had) { location.reload(); return; }               // reload so the app reads your synced data
    await push(true);                                      // first sign-in: create your cloud copy
    start(u);
  } catch (err) {
    localStorage.setItem('pt.owner', u.uid); sessionStorage.setItem('pt.synced', u.uid); start(u);
    setTimeout(() => window.appToast && window.appToast('Cloud sync not available', (err && err.code === 'permission-denied') ? 'Firestore rules are blocking access. Check the rules in Firebase.' : 'Check that the Firestore database exists and you are online. The app works on this device meanwhile.', 9000), 1500);
  }
});

/* ---------------- installable app + updates ---------------- */
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => { const b = document.createElement('div'); b.className = 'upd';
      b.innerHTML = '<span>A new version of TradeBot is ready.</span><button type="button">Update</button>';
      b.querySelector('button').onclick = async () => { b.querySelector('button').textContent = 'Updating…'; try { await push(false); } catch (e) {} w.postMessage('skipWaiting'); };
      document.body.appendChild(b); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}
