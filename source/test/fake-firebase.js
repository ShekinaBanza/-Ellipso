// Minimal in-browser stand-in for the Firebase compat SDK (app, auth, firestore, storage), used only by the tests.
// Data lives in localStorage so several tabs share one "server"; each tab has its own signed-in user (sessionStorage).
(function () {
  const KEY = "__fakefb";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const listeners = new Set();
  const notify = () => setTimeout(() => listeners.forEach((f) => f()), 0);
  const save = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); notify(); };
  window.addEventListener("storage", (e) => { if (e.key === KEY) notify(); });

  class Timestamp {
    constructor(ms) { this._ms = ms; }
    toMillis() { return this._ms; } toDate() { return new Date(this._ms); }
    static fromMillis(ms) { return new Timestamp(ms); } static fromDate(d) { return new Timestamp(d.getTime()); } static now() { return new Timestamp(Date.now()); }
  }
  const FieldValue = { serverTimestamp: () => ({ __sv: "ts" }), increment: (n) => ({ __sv: "inc", n }), delete: () => ({ __sv: "del" }) };
  const enc = (v) => (v instanceof Timestamp ? { __ts: v._ms } : v);
  const dec = (o) => { if (o && typeof o === "object") { if ("__ts" in o) return new Timestamp(o.__ts); const r = Array.isArray(o) ? [] : {}; for (const k in o) r[k] = dec(o[k]); return r; } return o; };
  function apply(old, data, merge) {
    const out = merge ? Object.assign({}, old || {}) : {};
    for (const k in data) {
      const v = data[k];
      if (v && v.__sv === "ts") out[k] = { __ts: Date.now() };
      else if (v && v.__sv === "inc") out[k] = ((old && old[k]) || 0) + v.n;
      else if (v && v.__sv === "del") delete out[k];
      else out[k] = enc(v);
    }
    return out;
  }
  const val = (v) => (v instanceof Timestamp ? v._ms : v && v.__ts != null ? v.__ts : v);
  let autoN = 0;
  const autoId = () => Date.now().toString(36) + (autoN++).toString(36) + Math.random().toString(36).slice(2, 7);

  class DocSnap { constructor(path, raw) { this.ref = new DocRef(path); this.id = path.split("/").pop(); this.exists = raw != null; this._raw = raw; } data() { return this._raw == null ? undefined : dec(this._raw); } get(k) { const d = this.data(); return d && d[k]; } }
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split("/").pop(); }
    collection(n) { return new ColRef(this.path + "/" + n); }
    get() { return Promise.resolve(new DocSnap(this.path, load()[this.path])); }
    set(data, opts) { const db = load(); db[this.path] = apply(db[this.path], data, opts && opts.merge); save(db); return Promise.resolve(); }
    update(data) { const db = load(); if (!db[this.path]) return Promise.reject(Object.assign(new Error("No document to update"), { code: "not-found" })); db[this.path] = apply(db[this.path], data, true); save(db); return Promise.resolve(); }
    delete() { const db = load(); delete db[this.path]; save(db); return Promise.resolve(); }
    onSnapshot(cb) { let last = null; const f = () => { const raw = load()[this.path], s = JSON.stringify(raw); if (s !== last) { last = s; cb(new DocSnap(this.path, raw)); } }; listeners.add(f); f(); return () => listeners.delete(f); }
  }
  class Query {
    constructor(col, filters, order, lim, after) { this.col = col; this.f = filters || []; this.o = order || []; this.l = lim; this.a = after; }
    where(field, op, v) { return new Query(this.col, this.f.concat([[field, op, v]]), this.o, this.l, this.a); }
    orderBy(field, dir) { return new Query(this.col, this.f, this.o.concat([[field, dir || "asc"]]), this.l, this.a); }
    limit(n) { return new Query(this.col, this.f, this.o, n, this.a); }
    startAfter(snap) { return new Query(this.col, this.f, this.o, this.l, snap); }
    _run() {
      const db = load(), depth = this.col.split("/").length + 1;
      let rows = Object.keys(db).filter((p) => p.startsWith(this.col + "/") && p.split("/").length === depth).map((p) => ({ p, d: db[p] }));
      for (const [k, op, v] of this.f) rows = rows.filter((r) => { const a = val(r.d[k]), b = val(v); return op === "==" ? a === b : op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : op === "<=" ? a <= b : op === "!=" ? a !== b : true; });
      for (const [k] of this.o) rows = rows.filter((r) => r.d[k] !== undefined);
      rows.sort((x, y) => { for (const [k, dir] of this.o) { const a = val(x.d[k]), b = val(y.d[k]); if (a < b) return dir === "desc" ? 1 : -1; if (a > b) return dir === "desc" ? -1 : 1; } return 0; });
      if (this.a) { const i = rows.findIndex((r) => r.p === this.a.ref.path); rows = rows.slice(i + 1); }
      if (this.l) rows = rows.slice(0, this.l);
      const docs = rows.map((r) => new DocSnap(r.p, r.d));
      return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
    }
    get() { return Promise.resolve(this._run()); }
    onSnapshot(cb) { let last = null; const f = () => { const q = this._run(), s = JSON.stringify(q.docs.map((d) => [d.ref.path, d._raw])); if (s !== last) { last = s; cb(q); } }; listeners.add(f); f(); return () => listeners.delete(f); }
  }
  class ColRef extends Query {
    constructor(path) { super(path); this.path = path; }
    doc(id) { return new DocRef(this.path + "/" + (id || autoId())); }
    add(data) { const r = this.doc(); return r.set(data).then(() => r); }
  }
  function makeAuth(name) {
    const k = "__fakeauth_" + name, subs = new Set();
    const a = {
      currentUser: JSON.parse(sessionStorage.getItem(k) || "null"),
      _set(u) { a.currentUser = u; sessionStorage.setItem(k, JSON.stringify(u)); subs.forEach((cb) => setTimeout(() => cb(u), 0)); },
      onAuthStateChanged(cb) { subs.add(cb); setTimeout(() => cb(a.currentUser), 0); return () => subs.delete(cb); },
      signInAnonymously() { const u = { uid: "anon_" + autoId(), isAnonymous: true }; a._set(u); return Promise.resolve({ user: u }); },
      signInWithEmailAndPassword(email, pass) {
        const acc = (JSON.parse(localStorage.getItem("__fakeaccounts") || "[]")).find((x) => x.email === email && x.pass === pass);
        if (!acc) return Promise.reject(Object.assign(new Error("wrong password"), { code: "auth/wrong-password" }));
        const u = { uid: acc.uid, email }; a._set(u); return Promise.resolve({ user: u });
      },
      signOut() { a._set(null); return Promise.resolve(); },
    };
    return a;
  }
  const apps = [];
  function initializeApp(cfg, name) {
    name = name || "[DEFAULT]";
    const app = { name, options: cfg, _auth: makeAuth(name), auth() { return this._auth; }, firestore() { return fs; },
      storage() { return { ref: (p) => ({ put: (file) => Promise.resolve({ ref: { getDownloadURL: () => Promise.resolve(URL.createObjectURL(file)) } }) }) }; } };
    apps.push(app); return app;
  }
  const fs = { collection: (n) => new ColRef(n), doc: (p) => new DocRef(p), enablePersistence: () => Promise.resolve() };
  const firestore = () => fs; firestore.FieldValue = FieldValue; firestore.Timestamp = Timestamp;
  window.firebase = { initializeApp, apps, app: (n) => apps.find((a) => a.name === (n || "[DEFAULT]")), firestore, storage: () => ({}), auth: () => apps[0].auth() };
  window.__fakefb = { load, save, reset: () => localStorage.removeItem(KEY) };
})();
