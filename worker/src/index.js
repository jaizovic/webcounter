const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export default {
  async fetch(request, env, ctx) {
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
        return recordEvent(request, env, ctx);
      }
      if (request.method === "GET" && url.pathname === "/api/events/pixel.gif") {
        return recordPixelEvent(request, env, ctx);
      }

      const statsMatch = url.pathname.match(/^\/api\/sites\/([a-f0-9-]+)\/stats$/i);
      if (request.method === "GET" && statsMatch) {
        return getStats(request, env, statsMatch[1]);
      }

      const diagnosticsMatch = url.pathname.match(/^\/api\/sites\/([a-f0-9-]+)\/diagnostics$/i);
      if (request.method === "GET" && diagnosticsMatch) {
        return getDiagnostics(request, env, diagnosticsMatch[1], ctx);
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

async function recordEvent(request, env, ctx, suppliedBody) {
  const body = suppliedBody || await readEventBody(request);
  const siteId = cleanId(body.siteId);
  const visitorId = String(body.visitorId || "");
  const eventType = body.type === "heartbeat" ? "heartbeat" : "view";
  const pagePath = cleanPath(body.page);
  const eventId = cleanEventId(body.eventId);
  const transport = cleanTransport(body.transport);
  const browserFamily = detectBrowserFamily(request.headers.get("User-Agent"));
  const likelyBot = isLikelyBot(request.headers.get("User-Agent"));
  const filterBots = body.filterBots === true || body.filterBots === "true" || body.filterBots === "1";

  if (!siteId) {
    return json({ error: "Invalid event" }, 400, request);
  }

  const site = await env.DB.prepare(
    "SELECT id, domain FROM sites WHERE id = ?"
  ).bind(siteId).first();

  if (!site) return json({ error: "Unknown site" }, 404, request);

  const origin = requestSourceOrigin(request);
  if (visitorId.length < 8 || visitorId.length > 100) {
    await writeDiagnostic(env, {
      siteId, outcome: "rejected", reason: "invalid_visitor", eventType,
      pagePath, browserFamily, likelyBot, transport,
    });
    return json({ error: "Invalid event", code: "invalid_visitor" }, 400, request, origin);
  }

  if (!originMatchesDomain(origin, site.domain)) {
    await writeDiagnostic(env, {
      siteId, outcome: "rejected", reason: "origin_mismatch", eventType,
      pagePath, browserFamily, likelyBot, transport,
    });
    return json({
      error: "This site ID is not registered for the requesting domain",
      code: "origin_mismatch",
    }, 403, request, origin);
  }

  if (likelyBot && filterBots) {
    if (eventType === "view") {
      await writeDiagnostic(env, {
        siteId, outcome: "filtered", reason: "likely_bot", eventType,
        pagePath, browserFamily, likelyBot, transport,
      });
    }
    scheduleDiagnosticCleanup(env, ctx);
    return json({ ok: true, accepted: false, filtered: true, reason: "likely_bot" }, 202, request, origin);
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
    return json({ ok: true, accepted: true }, 200, request, origin);
  }

  if (eventId) {
    const duplicate = await env.DB.prepare(
      "SELECT 1 FROM visits WHERE site_id = ? AND event_id = ?"
    ).bind(siteId, eventId).first();
    if (duplicate) {
      return json({ ok: true, accepted: true, duplicate: true }, 200, request, origin);
    }
  }

  await env.DB.batch([
    presenceStatement,
    env.DB.prepare("UPDATE sites SET total_views = total_views + 1 WHERE id = ?").bind(siteId),
    env.DB.prepare(`
      INSERT INTO visits (
        site_id, visitor_hash, country_code, city, page_path, visited_at,
        event_id, browser_family, is_bot
      )
      VALUES (?, ?, ?, ?, ?, unixepoch(), ?, ?, ?)
    `).bind(siteId, visitorHash, countryCode, city, pagePath, eventId, browserFamily, likelyBot ? 1 : 0),
    diagnosticStatement(env, {
      siteId, outcome: "accepted", reason: likelyBot ? "likely_bot_included" : "",
      eventType, pagePath, browserFamily, likelyBot, transport,
    }),
  ]);

  scheduleDiagnosticCleanup(env, ctx);
  return json({ ok: true, accepted: true, likelyBot }, 201, request, origin);
}

async function recordPixelEvent(request, env, ctx) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    await recordEvent(request, env, ctx, params);
  } catch (error) {
    console.error("WebCounter pixel fallback failed", error);
  }
  return new Response(GIF_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF_PIXEL.byteLength),
      "Cache-Control": "no-store, max-age=0",
    },
  });
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
      LIMIT 20
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

async function getDiagnostics(request, env, siteId, ctx) {
  const site = await env.DB.prepare(
    "SELECT id, domain, name FROM sites WHERE id = ?"
  ).bind(siteId).first();

  if (!site) return json({ error: "Unknown site" }, 404, request);

  const [summaryResult, recentResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN outcome = 'filtered' THEN 1 ELSE 0 END) AS filtered,
        SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM event_diagnostics
      WHERE site_id = ? AND created_at >= unixepoch() - 86400
    `).bind(siteId),
    env.DB.prepare(`
      SELECT outcome, reason, page_path, browser_family, is_bot, transport, created_at
      FROM event_diagnostics
      WHERE site_id = ? AND created_at >= unixepoch() - 86400
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `).bind(siteId),
  ]);

  const totals = summaryResult.results?.[0] || {};
  scheduleDiagnosticCleanup(env, ctx, true);
  return json({
    site: { id: site.id, domain: site.domain, name: site.name },
    windowHours: 24,
    summary: {
      accepted: Number(totals.accepted || 0),
      filteredBots: Number(totals.filtered || 0),
      rejected: Number(totals.rejected || 0),
    },
    recent: (recentResult.results || []).map((entry) => ({
      outcome: entry.outcome,
      reason: entry.reason || "",
      page: entry.page_path || "/",
      browserFamily: entry.browser_family || "Unknown",
      likelyBot: Boolean(entry.is_bot),
      transport: entry.transport || "unknown",
      occurredAt: entry.created_at,
    })),
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
  const path = cleanText(value || "/", 500).split(/[?#]/, 1)[0];
  return path.startsWith("/") ? path : "/";
}

function cleanEventId(value) {
  const id = String(value || "").toLowerCase();
  return /^[a-z0-9-]{8,100}$/.test(id) ? id : "";
}

function cleanTransport(value) {
  const transport = String(value || "xhr").toLowerCase();
  return ["xhr", "fetch", "beacon", "pixel"].includes(transport) ? transport : "unknown";
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

async function readEventBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) return request.json();
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function requestSourceOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin;
  const referer = request.headers.get("Referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function detectBrowserFamily(userAgentValue) {
  const userAgent = String(userAgentValue || "");
  if (isLikelyBot(userAgent)) return "Bot / crawler";
  if (/EdgA?\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\/|Opera/i.test(userAgent)) return "Opera";
  if (/SamsungBrowser\//i.test(userAgent)) return "Samsung Internet";
  if (/CriOS\/|Chrome\//i.test(userAgent)) return "Chrome";
  if (/FxiOS\/|Firefox\//i.test(userAgent)) return "Firefox";
  if (/MSIE |Trident\//i.test(userAgent)) return "Internet Explorer";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return userAgent ? "Other browser" : "Unknown";
}

function isLikelyBot(userAgentValue) {
  const userAgent = String(userAgentValue || "");
  if (!userAgent) return true;
  return /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|pagespeed|pingdom|uptimerobot|curl|wget|python-requests|go-http-client|httpclient|semrush|ahrefs|mj12bot|bytespider|yandex|baidu)/i.test(userAgent);
}

function diagnosticStatement(env, diagnostic) {
  return env.DB.prepare(`
    INSERT INTO event_diagnostics (
      site_id, outcome, reason, event_type, page_path,
      browser_family, is_bot, transport, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).bind(
    diagnostic.siteId,
    diagnostic.outcome,
    diagnostic.reason || "",
    diagnostic.eventType,
    diagnostic.pagePath,
    diagnostic.browserFamily,
    diagnostic.likelyBot ? 1 : 0,
    diagnostic.transport
  );
}

async function writeDiagnostic(env, diagnostic) {
  if (diagnostic.eventType !== "view") return;
  await diagnosticStatement(env, diagnostic).run();
}

function scheduleDiagnosticCleanup(env, ctx, force = false) {
  if (!ctx || (!force && Math.random() >= 0.01)) return;
  ctx.waitUntil(
    env.DB.prepare("DELETE FROM event_diagnostics WHERE created_at < unixepoch() - 604800").run()
  );
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

const GIF_PIXEL = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 1, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);
