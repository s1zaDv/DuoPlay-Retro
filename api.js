"use strict";
/* =====================================================================
   DuoPlay API (Netlify Function única). Rotas em /api/*.
   - Sessão em cookies HttpOnly/Secure/SameSite=Strict (o navegador nunca vê os tokens).
   - Chaves ficam só em variáveis de ambiente do Netlify (nunca no código nem no front).
   - Sem dependências externas: só Node 18+ (crypto e fetch nativos).
   ===================================================================== */
const crypto = require("crypto");
const E = process.env;
const SB = (E.SUPABASE_URL || "").replace(/\/$/, ""), ANON = E.SUPABASE_ANON_KEY, SVC = E.SUPABASE_SERVICE_ROLE_KEY;
const SITE = (E.SITE_URL || "").replace(/\/$/, "");
const KEY = E.APP_ENCRYPTION_KEY ? Buffer.from(E.APP_ENCRYPTION_KEY, "base64") : null;
const PROD = E.CONTEXT === "production";

/* ---------- utilitários ---------- */
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const rand = (n) => crypto.randomBytes(n).toString("base64url");
function enc(txt) {                                  // AES-256-GCM
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(txt, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}
function dec(s) {
  try {
    const [iv, tag, ct] = String(s).split(".").map((x) => Buffer.from(x, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return null; }
}
const res = (status, body, cookies) => {
  const r = { statusCode: status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) };
  if (cookies && cookies.length) r.multiValueHeaders = { "Set-Cookie": cookies };
  return r;
};
const fail = (s, code) => res(s, { error: code });
const ck = (n, v, age) => `__Host-${n}=${v}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Strict`;
const sess = (d) => [ck("dp_at", d.access_token, Math.min(d.expires_in || 3600, 3600)), ck("dp_rt", d.refresh_token, 2592000)];
const clear = () => ["dp_at", "dp_rt", "dp_mfa"].map((n) => ck(n, "", 0));
const cookiesOf = (h) => Object.fromEntries(String(h || "").split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));
const pub = (bucket, p) => (p ? `${SB}/storage/v1/object/public/${bucket}/${p}` : null);

/* ---------- validação (lista branca; nada de montar consulta com texto livre) ---------- */
const V = {
  email: (s) => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s),
  pass: (s) => typeof s === "string" && s.length >= 10 && s.length <= 128,
  user: (s) => typeof s === "string" && /^[a-z0-9_]{3,20}$/.test(s),
  tag: (s) => typeof s === "string" && /^\d{4}$/.test(s),
  code: (s) => typeof s === "string" && /^\d{6}$/.test(s),
  uuid: (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  ucode: (s) => typeof s === "string" && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(s)
};
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);

/* ---------- Supabase ---------- */
async function call(url, { method = "GET", body, key, token, headers } = {}) {
  try {
    const r = await fetch(SB + url, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: key, Authorization: "Bearer " + (token || key), "Content-Type": "application/json", ...headers }
    });
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { /* corpo não-JSON */ }
    return { ok: r.ok, status: r.status, data: d };
  } catch { return { ok: false, status: 502, data: null }; }
}
const gt = (p, o = {}) => call("/auth/v1" + p, { ...o, key: ANON });          // GoTrue (login, MFA...)
const db = (p, o = {}) => call("/rest/v1" + p, { ...o, key: SVC });            // dados (service_role, só no servidor)
const rpc = (fn, args) => db("/rpc/" + fn, { method: "POST", body: args });

/* ---------- limite de taxa e antirrobô ---------- */
async function limited(key, lim, win) {            // true = bloqueado. Se o banco falhar, bloqueia (fail-closed)
  const r = await rpc("rl_hit", { p_key: sha(key), p_lim: lim, p_win: win });
  return r.ok ? r.data !== true : true;
}
async function captchaOk(token, ip) {              // Cloudflare Turnstile
  if (!E.TURNSTILE_SECRET) return !PROD;           // em produção, sem chave configurada = bloqueia
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: E.TURNSTILE_SECRET, response: token, remoteip: ip }) });
    return !!(await r.json()).success;
  } catch { return false; }
}

/* ---------- sessão (lado do servidor) ---------- */
async function session(ev) {
  const c = cookiesOf(ev.headers.cookie); let at = c["__Host-dp_at"], set = [], u = null;
  if (at) u = await gt("/user", { token: at });
  if ((!u || !u.ok) && c["__Host-dp_rt"]) {
    const r = await gt("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: c["__Host-dp_rt"] } });
    if (!r.ok) return null;
    at = r.data.access_token; set = sess(r.data); u = await gt("/user", { token: at });
  }
  if (!u || !u.ok || !V.uuid(u.data.id)) return null;
  let aal = ""; try { aal = JSON.parse(Buffer.from(at.split(".")[1], "base64url").toString()).aal; } catch { /* sem aal */ }
  const factors = (u.data.factors || []).filter((f) => f.factor_type === "totp" && f.status === "verified");
  if (factors.length && aal !== "aal2") return null;   // 2FA ativo exige sessão validada em duas etapas
  return { id: u.data.id, email: u.data.email, at, set, factors, hasMfa: factors.length > 0 };
}

/* ---------- imagens (tipo, tamanho e assinatura do arquivo) ---------- */
function imageBuf(dataUrl, max) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) return null;
  const b = Buffer.from(m[2], "base64"); if (!b.length || b.length > max) return null;
  const ok = m[1] === "png" ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : m[1] === "jpeg" ? b[0] === 0xff && b[1] === 0xd8
    : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return ok ? { buf: b, ext: m[1] === "jpeg" ? "jpg" : m[1], type: "image/" + m[1] } : null;
}
const mapPeople = (list) => (list || []).map((p) => ({ id: p.id, username: p.username, tag: p.tag, display_name: p.display_name, avatar: pub("avatars", p.avatar_path), game_title: p.game_title, platform: p.platform, started_at: p.started_at }));

/* ---------- entrada ---------- */
exports.handler = async (ev) => {
  try {
    if (!SB || !ANON || !SVC || !KEY || KEY.length !== 32 || !SITE) return fail(500, "not_configured");
    const path = ev.path.replace(/^\/(\.netlify\/functions\/api|api)/, "").replace(/\/+$/, "") || "/";
    const m = ev.httpMethod, ip = ev.headers["x-nf-client-connection-ip"] || ev.headers["client-ip"] || "0";
    let body = {};
    if (ev.body) {
      if (ev.body.length > 4500000) return fail(413, "too_large");
      try { body = JSON.parse(ev.isBase64Encoded ? Buffer.from(ev.body, "base64").toString() : ev.body); } catch { return fail(400, "bad_json"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "bad_json");
    }
    if (path.startsWith("/app/")) return await appRoutes(ev, m, path, body, ip);
    if (m !== "GET" && ev.headers.origin !== SITE) return fail(403, "forbidden");      // proteção CSRF
    return await webRoutes(ev, m, path, body, ip);
  } catch (e) { console.error("api_error", e && e.message); return fail(500, "server_error"); }
};

/* ================= ROTAS DO SITE (cookie) ================= */
async function webRoutes(ev, m, path, b, ip) {
  const route = m + " " + path;

  if (route === "POST /auth/signup") {
    if (await limited("signup:" + ip, 5, 3600)) return fail(429, "rate_limited");
    if (!(await captchaOk(b.captcha, ip))) return fail(400, "captcha");
    const email = clean(b.email, 254).toLowerCase(), user = clean(b.username, 20).toLowerCase();
    if (!V.email(email) || !V.pass(b.password) || !V.user(user)) return fail(400, "invalid_input");
    if (b.terms !== true) return fail(400, "terms_required");
    const r = await gt("/signup?redirect_to=" + encodeURIComponent(SITE + "/conta.html"), { method: "POST", body: { email, password: b.password, data: { username: user } } });
    if (!r.ok && r.status >= 500) return fail(502, "auth_unavailable");
    return res(200, { ok: true });                  // resposta genérica: não revela se o e-mail já existe
  }

  if (route === "POST /auth/login") {
    const em = clean(b.email, 254).toLowerCase();
    if ((await limited("login:ip:" + ip, 20, 900)) || (await limited("login:em:" + em, 8, 900))) return fail(429, "rate_limited");
    if (!(await captchaOk(b.captcha, ip))) return fail(400, "captcha");
    if (!V.email(em) || typeof b.password !== "string" || b.password.length > 128) return fail(400, "invalid_input");
    const r = await gt("/token?grant_type=password", { method: "POST", body: { email: em, password: b.password } });
    if (!r.ok) return fail(401, "invalid_credentials");
    const u = await gt("/user", { token: r.data.access_token });
    const f = u.ok && (u.data.factors || []).find((x) => x.factor_type === "totp" && x.status === "verified");
    if (f) return res(200, { mfa: true }, [ck("dp_mfa", enc(JSON.stringify({ at: r.data.access_token, f: f.id, exp: Date.now() + 300000 })), 300)]);
    return res(200, { ok: true }, sess(r.data));
  }

  if (route === "POST /auth/mfa") {
    if (await limited("mfa:ip:" + ip, 15, 900)) return fail(429, "rate_limited");
    const raw = dec(cookiesOf(ev.headers.cookie)["__Host-dp_mfa"] || ""); let st = null; try { st = raw && JSON.parse(raw); } catch { /* inválido */ }
    if (!st || st.exp < Date.now() || !V.code(b.code) || !V.uuid(st.f)) return fail(401, "mfa_invalid");
    if (await limited("mfa:f:" + st.f, 6, 300)) return fail(429, "rate_limited");
    const ch = await gt(`/factors/${st.f}/challenge`, { method: "POST", token: st.at, body: {} });
    if (!ch.ok) return fail(401, "mfa_invalid");
    const v = await gt(`/factors/${st.f}/verify`, { method: "POST", token: st.at, body: { challenge_id: ch.data.id, code: b.code } });
    if (!v.ok) return fail(401, "mfa_invalid");
    return res(200, { ok: true }, [...sess(v.data), ck("dp_mfa", "", 0)]);
  }

  if (route === "POST /auth/forgot") {
    if (await limited("forgot:ip:" + ip, 5, 3600)) return fail(429, "rate_limited");
    if (!(await captchaOk(b.captcha, ip))) return fail(400, "captcha");
    const em = clean(b.email, 254).toLowerCase();
    if (V.email(em)) await gt("/recover?redirect_to=" + encodeURIComponent(SITE + "/conta.html"), { method: "POST", body: { email: em } });
    return res(200, { ok: true });                  // sempre igual, exista a conta ou não
  }

  if (route === "POST /auth/reset") {
    if (await limited("reset:ip:" + ip, 10, 3600)) return fail(429, "rate_limited");
    if (typeof b.access_token !== "string" || b.access_token.length > 4000 || !V.pass(b.password)) return fail(400, "invalid_input");
    const r = await gt("/user", { method: "PUT", token: b.access_token, body: { password: b.password } });
    return r.ok ? res(200, { ok: true }, clear()) : fail(400, "reset_failed");
  }

  if (route === "POST /auth/logout") {
    const t = cookiesOf(ev.headers.cookie)["__Host-dp_at"];
    if (t) await gt("/logout", { method: "POST", token: t });
    return res(200, { ok: true }, clear());
  }

  /* ---- a partir daqui, precisa estar logado ---- */
  const s = await session(ev);
  if (route === "GET /beta" && !s) { const r = await rpc("beta_status", { p_uid: null }); return res(200, { beta: r.data }); }
  if (!s) return fail(401, "unauthorized");
  const ok = (data) => res(200, data, s.set);

  if (route === "GET /beta") return ok({ beta: (await rpc("beta_status", { p_uid: s.id })).data });

  if (route === "GET /me") {
    const p = await db(`/profiles?id=eq.${s.id}&select=username,tag,display_name,bio,avatar_path,banner_path,show_activity,phone_enc,created_at`);
    const row = p.ok && p.data && p.data[0]; if (!row) return fail(404, "no_profile");
    const bs = await rpc("beta_status", { p_uid: s.id });
    return ok({ me: { email: s.email, username: row.username, tag: row.tag, display_name: row.display_name, bio: row.bio, avatar: pub("avatars", row.avatar_path), banner: pub("banners", row.banner_path), show_activity: row.show_activity, phone: row.phone_enc ? dec(row.phone_enc) || "" : "", two_factor: s.hasMfa, created_at: row.created_at }, beta: bs.data });
  }

  if (route === "PATCH /me") {                      // só estes campos são aceitos (evita mass assignment)
    const upd = {};
    if ("display_name" in b) { const v = clean(b.display_name, 32); if (!v) return fail(400, "invalid_input"); upd.display_name = v; }
    if ("bio" in b) upd.bio = clean(b.bio, 280);
    if ("show_activity" in b) { if (typeof b.show_activity !== "boolean") return fail(400, "invalid_input"); upd.show_activity = b.show_activity; }
    if ("phone" in b) { const v = clean(b.phone, 20); if (v && !/^\+?[0-9 ()-]{8,20}$/.test(v)) return fail(400, "invalid_input"); upd.phone_enc = v ? enc(v) : null; }
    if (!Object.keys(upd).length) return fail(400, "invalid_input");
    const r = await db(`/profiles?id=eq.${s.id}`, { method: "PATCH", body: upd });
    return r.ok ? ok({ ok: true }) : fail(502, "db_error");
  }

  if (route === "POST /me/avatar" || route === "POST /me/banner") {
    const k = path === "/me/avatar" ? ["avatars", 1048576, "avatar_path"] : ["banners", 2097152, "banner_path"];
    if (await limited("up:" + s.id, 10, 3600)) return fail(429, "rate_limited");
    const img = imageBuf(b.image, k[1]); if (!img) return fail(400, "invalid_image");
    const p = `${s.id}/${rand(12)}.${img.ext}`;
    const up = await fetch(`${SB}/storage/v1/object/${k[0]}/${p}`, { method: "POST", headers: { apikey: SVC, Authorization: "Bearer " + SVC, "Content-Type": img.type, "x-upsert": "true" }, body: img.buf });
    if (!up.ok) return fail(502, "upload_failed");
    const prev = await db(`/profiles?id=eq.${s.id}&select=${k[2]}`);
    const old = prev.ok && prev.data && prev.data[0] && prev.data[0][k[2]];
    await db(`/profiles?id=eq.${s.id}`, { method: "PATCH", body: { [k[2]]: p } });
    if (old && /^[0-9a-f-]{36}\/[\w-]+\.(png|jpg|webp)$/.test(old)) await fetch(`${SB}/storage/v1/object/${k[0]}/${old}`, { method: "DELETE", headers: { apikey: SVC, Authorization: "Bearer " + SVC } }).catch(() => {});
    return ok({ url: pub(k[0], p) });
  }

  if (route === "POST /me/mfa/enroll") {
    if (s.hasMfa) return fail(400, "already_enabled");
    const r = await gt("/factors", { method: "POST", token: s.at, body: { factor_type: "totp", friendly_name: "DuoPlay-" + rand(4) } });
    if (!r.ok || !r.data.totp) return fail(502, "mfa_error");
    return ok({ factorId: r.data.id, secret: r.data.totp.secret, uri: r.data.totp.uri, qr: r.data.totp.qr_code });
  }
  if (route === "POST /me/mfa/verify") {
    if (!V.uuid(b.factorId) || !V.code(b.code)) return fail(400, "invalid_input");
    if (await limited("mfav:" + s.id, 10, 900)) return fail(429, "rate_limited");
    const ch = await gt(`/factors/${b.factorId}/challenge`, { method: "POST", token: s.at, body: {} });
    if (!ch.ok) return fail(400, "mfa_invalid");
    const v = await gt(`/factors/${b.factorId}/verify`, { method: "POST", token: s.at, body: { challenge_id: ch.data.id, code: b.code } });
    if (!v.ok) return fail(400, "mfa_invalid");
    return res(200, { ok: true }, sess(v.data));    // sessão nova, já validada em duas etapas
  }
  if (route === "DELETE /me/mfa") {
    if (!s.factors.length) return fail(400, "not_enabled");
    const r = await gt("/factors/" + s.factors[0].id, { method: "DELETE", token: s.at });
    return r.ok ? ok({ ok: true }) : fail(400, "mfa_error");
  }

  if (route === "DELETE /me") {                     // direito de exclusão (LGPD)
    if (b.confirm !== "EXCLUIR") return fail(400, "confirm_required");
    const r = await call("/auth/v1/admin/users/" + s.id, { method: "DELETE", key: SVC });
    return r.ok ? res(200, { ok: true }, clear()) : fail(502, "delete_failed");
  }

  /* ---- amizades e atividade ---- */
  if (route === "GET /friends") {
    const r = (await rpc("friends_overview", { p_uid: s.id })).data || {};
    return ok({ friends: mapPeople(r.friends), incoming: mapPeople(r.incoming), outgoing: mapPeople(r.outgoing) });
  }
  if (route === "POST /friends/request") {
    const user = clean(b.username, 20).toLowerCase(), tag = clean(b.tag, 4);
    if (!V.user(user) || !V.tag(tag)) return fail(400, "invalid_input");
    if (await limited("fr:" + s.id, 20, 3600)) return fail(429, "rate_limited");
    return ok({ result: (await rpc("request_friend", { p_uid: s.id, p_username: user, p_tag: tag })).data });
  }
  if (route === "POST /friends/respond") {
    if (!V.uuid(b.id) || typeof b.accept !== "boolean") return fail(400, "invalid_input");
    return ok({ result: (await rpc("respond_friend", { p_uid: s.id, p_id: b.id, p_accept: b.accept })).data });
  }
  const del = m === "DELETE" && /^\/friends\/([0-9a-f-]{36})$/i.exec(path);
  if (del && V.uuid(del[1])) return ok({ result: (await rpc("remove_friend", { p_uid: s.id, p_id: del[1] })).data });
  if (route === "GET /friends/activity") return ok({ activity: mapPeople((await rpc("friends_activity", { p_uid: s.id })).data) });

  /* ---- Beta e vínculo do app ---- */
  if (route === "POST /beta/join") {
    if (await limited("beta:" + s.id, 5, 3600)) return fail(429, "rate_limited");
    return ok({ result: (await rpc("join_beta", { p_uid: s.id })).data });
  }
  if (route === "POST /me/device/approve") {
    const code = clean(b.user_code, 9).toUpperCase();
    if (!V.ucode(code)) return fail(400, "invalid_input");
    if (await limited("dev:approve:" + s.id, 10, 900)) return fail(429, "rate_limited");
    return ok({ result: (await rpc("device_approve", { p_uid: s.id, p_user_code: code })).data });
  }
  return fail(404, "not_found");
}

/* ================= ROTAS DO APP (Bearer dpapp_...) ================= */
async function appRoutes(ev, m, path, b, ip) {
  if (m === "POST" && path === "/app/device/start") {
    if (await limited("dev:start:" + ip, 20, 3600)) return fail(429, "rate_limited");
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = "";
    for (let i = 0; i < 8; i++) c += A[crypto.randomInt(A.length)];
    const code = c.slice(0, 4) + "-" + c.slice(4), device = rand(32);
    const r = await db("/device_codes", { method: "POST", body: { device_hash: sha(device), user_code: code, expires_at: new Date(Date.now() + 600000).toISOString() } });
    if (!r.ok) return fail(502, "db_error");
    return res(200, { device_code: device, user_code: code, verification_url: SITE + "/conta.html#vincular", expires_in: 600, interval: 5 });
  }
  if (m === "POST" && path === "/app/device/poll") {
    if (typeof b.device_code !== "string" || b.device_code.length < 20 || b.device_code.length > 100) return fail(400, "invalid_input");
    if (await limited("dev:poll:" + ip, 200, 600)) return fail(429, "rate_limited");
    const tok = "dpapp_" + rand(32);
    const r = await rpc("device_poll", { p_device_hash: sha(b.device_code), p_token_hash: sha(tok) });
    const st = r.data && r.data.status;
    return st === "ok" ? res(200, { status: "ok", app_token: tok }) : res(200, { status: st === "pending" ? "pending" : "expired" });
  }

  const t = /^Bearer (dpapp_[A-Za-z0-9_-]{20,60})$/.exec(ev.headers.authorization || "");
  if (!t) return fail(401, "unauthorized");
  const uid = (await rpc("app_token_user", { p_hash: sha(t[1]) })).data;
  if (!V.uuid(uid)) return fail(401, "unauthorized");
  if (await limited("app:" + uid, 600, 600)) return fail(429, "rate_limited");
  const route = m + " " + path;

  if (route === "GET /app/me") {
    const p = await db(`/profiles?id=eq.${uid}&select=username,tag,display_name,avatar_path`);
    const r = p.ok && p.data && p.data[0]; if (!r) return fail(404, "no_profile");
    return res(200, { me: { username: r.username, tag: r.tag, display_name: r.display_name, avatar: pub("avatars", r.avatar_path) } });
  }
  if (route === "GET /app/friends") {
    const r = (await rpc("friends_overview", { p_uid: uid })).data || {};
    return res(200, { friends: mapPeople(r.friends), incoming: mapPeople(r.incoming), outgoing: mapPeople(r.outgoing) });
  }
  if (route === "GET /app/friends/activity") return res(200, { activity: mapPeople((await rpc("friends_activity", { p_uid: uid })).data) });
  if (route === "POST /app/activity") {            // chamar a cada ~60 s enquanto joga
    const title = clean(b.game_title, 80), plat = clean(b.platform, 30);
    if (!title) return fail(400, "invalid_input");
    await rpc("set_activity", { p_uid: uid, p_title: title, p_platform: plat });
    return res(200, { ok: true });
  }
  if (route === "DELETE /app/activity") { await db(`/activity?user_id=eq.${uid}`, { method: "DELETE" }); return res(200, { ok: true }); }
  if (route === "GET /app/beta") return res(200, { beta: (await rpc("beta_status", { p_uid: uid })).data });
  if (route === "POST /app/usage") {               // informa segundos jogados (1 a 300 por chamada)
    const sec = Number.isInteger(b.seconds) ? b.seconds : 0;
    if (sec < 1 || sec > 300) return fail(400, "invalid_input");
    const r = await rpc("usage_add", { p_uid: uid, p_seconds: sec });
    return r.ok ? res(200, r.data) : fail(502, "db_error");
  }
  return fail(404, "not_found");
}
