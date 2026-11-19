// Production smoke test. Run after every deploy:   npm run smoke -- https://your-app.vercel.app
// Optional:  CRON_SECRET=... npm run smoke -- https://your-app.vercel.app   (also checks the cron endpoint accepts the secret)
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) { console.error("Usage: npm run smoke -- https://your-app.vercel.app"); process.exit(2); }

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failed++; };
const get = (path, init = {}) => fetch(base + path, { redirect: "manual", ...init });

for (const path of ["/", "/login", "/register"]) { const r = await get(path); check(`${path} loads`, r.status === 200, String(r.status)); }
const landing = await (await get("/")).text();
check("Landing page has its main heading", /Choose what to plant next/.test(landing));

for (const path of ["/dashboard", "/farms", "/admin", "/officer", "/notifications"]) {
  const r = await get(path); const loc = r.headers.get("location") ?? "";
  check(`${path} sends signed-out visitors to login`, [301, 302, 303, 307, 308].includes(r.status) && /\/login/.test(loc), `${r.status} ${loc}`);
}

const h = await get("/login");
for (const [name, re] of [["X-Frame-Options", /DENY/], ["X-Content-Type-Options", /nosniff/], ["Strict-Transport-Security", /max-age/], ["Referrer-Policy", /.+/]]) check(`Header ${name}`, re.test(h.headers.get(name) ?? ""));
const csp = h.headers.get("content-security-policy") ?? h.headers.get("content-security-policy-report-only") ?? "";
check("Content-Security-Policy present", /default-src 'self'/.test(csp), h.headers.get("content-security-policy") ? "enforced" : "report-only");
check("Server does not advertise its framework", !h.headers.get("x-powered-by"));

const health = await get("/api/health");
check("/api/health answers ok", health.status === 200 && (await health.json()).status === "ok");

const noSecret = await get("/api/cron/nasa-sync");
check("Cron endpoint refuses requests without the secret", noSecret.status === 401, String(noSecret.status));
if (process.env.CRON_SECRET) {
  const ok = await get("/api/cron/nasa-sync", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  check("Cron endpoint accepts the real secret", ok.status === 200, String(ok.status));
}

const nf = await get("/definitely-not-a-page");
check("Unknown pages show the friendly 404", nf.status === 404 && /Page not found/.test(await nf.text()));
const robots = await (await get("/robots.txt")).text();
check("robots.txt hides the signed-in areas", /Disallow: \/dashboard/.test(robots));

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
