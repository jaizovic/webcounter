(() => {
  const script = document.currentScript;
  if (!script) return;

  const siteId = script.dataset.site;
  const apiUrl = String(script.dataset.api || "").replace(/\/$/, "");
  const theme = script.dataset.theme === "light" ? "light" : "dark";
  if (!siteId || !apiUrl) {
    console.warn("WebCounter: data-site and data-api are required.");
    return;
  }

  const mount = document.createElement("div");
  mount.setAttribute("data-webcounter", siteId);
  script.insertAdjacentElement("afterend", mount);
  const root = mount.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { color-scheme: ${theme}; }
      * { box-sizing: border-box; }
      .wc-card { width: min(100%, 360px); border-radius: 16px; padding: 18px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.3; box-shadow: 0 18px 48px rgba(0,0,0,.18); }
      .wc-card.dark { background: #08131b; border: 1px solid rgba(140,223,228,.2); color: #e8f8f7; }
      .wc-card.light { background: #f4fbfa; border: 1px solid #c5dcda; color: #0b2930; }
      .wc-top, .wc-label, .wc-footer { display: flex; justify-content: space-between; align-items: center; }
      .wc-live { color: #32bec6; font: 700 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .13em; }
      .wc-live i { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #5ce1e6; box-shadow: 0 0 0 4px rgba(92,225,230,.08); }
      .wc-signal { color: #32bec6; font-size: 12px; letter-spacing: -2px; }
      .wc-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 22px 0 18px; }
      .wc-metric + .wc-metric { border-left: 1px solid rgba(122,164,168,.2); padding-left: 18px; }
      .wc-value { display: flex; align-items: center; gap: 7px; font-size: 26px; font-weight: 800; line-height: 1; letter-spacing: -.04em; }
      .wc-online-dot { width: 8px; height: 8px; border-radius: 50%; background: #ceff68; box-shadow: 0 0 10px rgba(206,255,104,.55); }
      .wc-caption { margin-top: 7px; color: #78959b; font-size: 10px; }
      .wc-label { padding: 10px 0 7px; border-top: 1px solid rgba(122,164,168,.16); color: #69858b; font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; }
      .wc-list { list-style: none; margin: 0; padding: 0; }
      .wc-list li { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; min-height: 48px; border-top: 1px solid rgba(122,164,168,.11); }
      .wc-flag { font-size: 18px; }
      .wc-place strong, .wc-place small { display: block; }
      .wc-place strong { font-size: 11px; }
      .wc-place small, .wc-time { color: #708c92; font-size: 9px; }
      .wc-empty { display: block !important; padding: 18px 0; color: #708c92; font-size: 11px; text-align: center; }
      .wc-footer { margin-top: 7px; padding-top: 11px; border-top: 1px solid rgba(122,164,168,.14); color: #69858b; font-size: 9px; }
      .wc-footer strong { color: #32bec6; }
      .wc-status { color: #86a961; }
      .light .wc-live, .light .wc-footer strong { color: #087c85; }
      .light .wc-place small, .light .wc-time, .light .wc-label, .light .wc-footer, .light .wc-caption { color: #5d777b; }
      @media (max-width: 380px) { .wc-card { padding: 15px; } .wc-value { font-size: 23px; } }
    </style>
    <section class="wc-card ${theme}" aria-label="Live website traffic">
      <div class="wc-top"><span class="wc-live"><i></i> LIVE TRAFFIC</span><span class="wc-signal" aria-hidden="true">▂▄▆█</span></div>
      <div class="wc-metrics">
        <div class="wc-metric"><div class="wc-value" data-visits>—</div><div class="wc-caption">Total visits</div></div>
        <div class="wc-metric"><div class="wc-value"><i class="wc-online-dot"></i><span data-online>—</span></div><div class="wc-caption">Online now</div></div>
      </div>
      <div class="wc-label"><span>RECENT VISITORS</span><span>LIVE</span></div>
      <ul class="wc-list" data-list><li class="wc-empty">Loading recent activity…</li></ul>
      <div class="wc-footer"><span>Powered by <strong>WebCounter</strong></span><span class="wc-status">● Live</span></div>
    </section>`;

  const visitsNode = root.querySelector("[data-visits]");
  const onlineNode = root.querySelector("[data-online]");
  const listNode = root.querySelector("[data-list]");
  const statusNode = root.querySelector(".wc-status");

  function getVisitorId() {
    const key = `webcounter:${siteId}:visitor`;
    try {
      let value = localStorage.getItem(key);
      if (!value) {
        value = crypto.randomUUID();
        localStorage.setItem(key, value);
      }
      return value;
    } catch {
      return crypto.randomUUID();
    }
  }

  const visitorId = getVisitorId();

  function countryFlag(code) {
    if (!/^[A-Z]{2}$/.test(code || "")) return "🌐";
    return String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)));
  }

  function timeAgo(epochSeconds) {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(epochSeconds || 0));
    if (seconds < 60) return "now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  function render(stats) {
    visitsNode.textContent = Number(stats.totalVisits || 0).toLocaleString();
    onlineNode.textContent = Number(stats.onlineNow || 0).toLocaleString();
    listNode.replaceChildren();
    if (!stats.recentVisitors?.length) {
      const empty = document.createElement("li");
      empty.className = "wc-empty";
      empty.textContent = "No recent visits yet.";
      listNode.append(empty);
      return;
    }

    stats.recentVisitors.slice(0, 6).forEach((visitor) => {
      const item = document.createElement("li");
      const flag = document.createElement("span");
      flag.className = "wc-flag";
      flag.textContent = countryFlag(visitor.countryCode);
      const place = document.createElement("span");
      place.className = "wc-place";
      const city = document.createElement("strong");
      city.textContent = visitor.city || "Unknown city";
      const country = document.createElement("small");
      country.textContent = visitor.countryName || visitor.countryCode || "Unknown country";
      place.append(city, country);
      const time = document.createElement("time");
      time.className = "wc-time";
      time.textContent = timeAgo(visitor.visitedAt);
      item.append(flag, place, time);
      listNode.append(item);
    });
  }

  async function sendEvent(type) {
    try {
      await fetch(`${apiUrl}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, visitorId, type, page: `${location.pathname}${location.search}`.slice(0, 500) }),
        keepalive: true,
      });
    } catch {
      statusNode.textContent = "○ Offline";
    }
  }

  async function refresh() {
    try {
      const response = await fetch(`${apiUrl}/api/sites/${encodeURIComponent(siteId)}/stats`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      render(await response.json());
      statusNode.textContent = "● Live";
    } catch {
      statusNode.textContent = "○ Offline";
    }
  }

  sendEvent("view").then(refresh);
  const refreshTimer = setInterval(refresh, 15000);
  const heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "visible") sendEvent("heartbeat");
  }, 25000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendEvent("heartbeat");
      refresh();
    }
  });

  window.addEventListener("pagehide", () => {
    clearInterval(refreshTimer);
    clearInterval(heartbeatTimer);
  }, { once: true });
})();
