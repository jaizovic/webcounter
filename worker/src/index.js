const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin")) });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "webcounter-api" }, 200, request);
      }
      if (request.method === "POST" && url.pathname === "/api/sites") {
        return registerSite(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/events") {
        return recordEvent(request, env);
      }

      const statsMatch = url.pathname.match(/^\/api\/sites\/([a-f0-9-]+)\/stats$/i);
      if (request.method === "GET" && statsMatch) {
        return getStats(request, env, statsMatch[1]);
      }

      return json({ error: "Not found" }, 404, request);
    } catch (error) {
      console.error("WebCounter request failed", error);
      return json({ error: "Service temporarily unavailable" }, 500, request);
    }
  },
};

async function registerSite(request, env) {
  const body = await readJson(request);
  const domain = normalizeDomain(body.domain);
  const name = cleanText(body.name, 60);

  if (!domain || !isValidDomain(domain)) {
    return json({ error: "Enter a valid domain such as example.com" }, 400, request);
  }

  const existing = await env.DB.prepare(
    "SELECT id, domain, name, created_at FROM sites WHERE domain = ?"
  ).bind(domain).first();

  if (existing) {
    return json({ site: toPublicSite(existing), existing: true }, 200, request);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO sites (id, domain, name) VALUES (?, ?, ?)"
  ).bind(id, domain, name).run();

  return json({
    site: { id, domain, name, createdAt: Math.floor(Date.now() / 1000) },
    existing: false,
  }, 201, request);
}

async function recordEvent(request, env) {
  const body = await readJson(request);
  const siteId = cleanId(body.siteId);
  const visitorId = String(body.visitorId || "");
  const eventType = body.type === "heartbeat" ? "heartbeat" : "view";
  const pagePath = cleanPath(body.page);

  if (!siteId || visitorId.length < 8 || visitorId.length > 100) {
    return json({ error: "Invalid event" }, 400, request);
  }

  const site = await env.DB.prepare(
    "SELECT id, domain FROM sites WHERE id = ?"
  ).bind(siteId).first();

  if (!site) return json({ error: "Unknown site" }, 404, request);

  const origin = request.headers.get("Origin");
  if (!originMatchesDomain(origin, site.domain)) {
    return json({ error: "This site ID is not registered for the requesting domain" }, 403, request);
  }

  const countryCode = cleanCountryCode(request.cf?.country);
  const city = cleanText(request.cf?.city, 80);
  const visitorHash = await sha256(`${siteId}:${visitorId}`);
  const presenceStatement = env.DB.prepare(`
    INSERT INTO visitors (site_id, visitor_hash, country_code, city, first_seen, last_seen)
    VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(site_id, visitor_hash) DO UPDATE SET
      country_code = excluded.country_code,
      city = excluded.city,
      last_seen = unixepoch()
  `).bind(siteId, visitorHash, countryCode, city);

  if (eventType === "heartbeat") {
    await presenceStatement.run();
    return json({ ok: true }, 200, request, origin);
  }

  await env.DB.batch([
    presenceStatement,
    env.DB.prepare("UPDATE sites SET total_views = total_views + 1 WHERE id = ?").bind(siteId),
    env.DB.prepare(`
      INSERT INTO visits (site_id, visitor_hash, country_code, city, page_path, visited_at)
      VALUES (?, ?, ?, ?, ?, unixepoch())
    `).bind(siteId, visitorHash, countryCode, city, pagePath),
  ]);

  return json({ ok: true }, 201, request, origin);
}

async function getStats(request, env, siteId) {
  const site = await env.DB.prepare(
    "SELECT id, domain, name, total_views FROM sites WHERE id = ?"
  ).bind(siteId).first();

  if (!site) return json({ error: "Unknown site" }, 404, request);

  const [onlineResult, recentResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM visitors
      WHERE site_id = ? AND last_seen >= unixepoch() - 60
    `).bind(siteId),
    env.DB.prepare(`
      SELECT country_code, city, visited_at
      FROM visits
      WHERE site_id = ?
      ORDER BY visited_at DESC, id DESC
      LIMIT 12
    `).bind(siteId),
  ]);

  const recentVisitors = (recentResult.results || []).map((visit) => ({
    countryCode: visit.country_code,
    countryName: countryName(visit.country_code),
    city: visit.city || "Unknown city",
    visitedAt: visit.visited_at,
  }));

  return json({
    site: { id: site.id, domain: site.domain, name: site.name },
    totalVisits: site.total_views,
    onlineNow: onlineResult.results?.[0]?.count || 0,
    recentVisitors,
    generatedAt: Math.floor(Date.now() / 1000),
  }, 200, request);
}

function normalizeDomain(value) {
  let domain = String(value || "").trim().toLowerCase();
  if (!domain) return "";
  if (!/^https?:\/\//.test(domain)) domain = `https://${domain}`;
  try {
    domain = new URL(domain).hostname;
  } catch {
    return "";
  }
  return canonicalHost(domain);
}

function canonicalHost(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function isValidDomain(domain) {
  if (domain === "localhost") return true;
  return domain.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
}

function originMatchesDomain(origin, registeredDomain) {
  if (!origin) return false;
  try {
    const host = canonicalHost(new URL(origin).hostname);
    const domain = canonicalHost(registeredDomain);
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function cleanCountryCode(value) {
  const code = String(value || "XX").toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "XX";
}

function countryName(code) {
  if (code === "XX") return "Unknown country";
  try {
    return COUNTRY_NAMES.of(code) || code;
  } catch {
    return code;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, maxLength);
}

function cleanPath(value) {
  const path = cleanText(value || "/", 500);
  return path.startsWith("/") ? path : "/";
}

function cleanId(value) {
  const id = String(value || "").toLowerCase();
  return /^[a-f0-9-]{36}$/.test(id) ? id : "";
}

function toPublicSite(site) {
  return { id: site.id, domain: site.domain, name: site.name, createdAt: site.created_at };
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) throw new Error("Expected JSON");
  return request.json();
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, request, allowedOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(allowedOrigin || request.headers.get("Origin")),
  };
  return new Response(JSON.stringify(data), { status, headers });
}
