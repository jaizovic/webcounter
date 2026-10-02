(function () {
  "use strict";

  var scripts = document.getElementsByTagName("script");
  var script = document.currentScript || scripts[scripts.length - 1];
  if (!script) return;

  function attribute(name) {
    return script.getAttribute(name) || "";
  }

  function clampNumber(value, minimum, maximum, fallback) {
    var number = Number(value);
    return isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  var siteId = attribute("data-site");
  var apiUrl = String(attribute("data-api")).replace(/\/$/, "");
  var theme = attribute("data-theme") === "light" ? "light" : "dark";
  var width = clampNumber(attribute("data-width"), 220, 300, 300);
  var visitorLimit = Math.round(clampNumber(attribute("data-visitors"), 1, 20, 6));
  var filterBots = attribute("data-filter-bots") === "true";

  if (!siteId || !apiUrl) {
    if (window.console && console.warn) console.warn("WebCounter: data-site and data-api are required.");
    return;
  }

  var mount = document.createElement("div");
  mount.setAttribute("data-webcounter", siteId);
  if (script.parentNode) script.parentNode.insertBefore(mount, script.nextSibling);
  var root = mount.attachShadow ? mount.attachShadow({ mode: "open" }) : mount;

  root.innerHTML = [
    "<style>",
    ":host { color-scheme: ", theme, "; }",
    "* { box-sizing: border-box; }",
    ".wc-card { width: ", width, "px; max-width: 100%; border-radius: 16px; padding: 18px; font-family: Inter, Arial, sans-serif; line-height: 1.3; box-shadow: 0 18px 48px rgba(0,0,0,.18); }",
    ".wc-card.dark { background: #08131b; border: 1px solid rgba(140,223,228,.2); color: #e8f8f7; }",
    ".wc-card.light { background: #f4fbfa; border: 1px solid #c5dcda; color: #0b2930; }",
    ".wc-top, .wc-label, .wc-footer { display: flex; justify-content: space-between; align-items: center; }",
    ".wc-live { color: #32bec6; font: 700 10px monospace; letter-spacing: .13em; }",
    ".wc-live i { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #5ce1e6; box-shadow: 0 0 0 4px rgba(92,225,230,.08); }",
    ".wc-signal { color: #32bec6; font-size: 12px; letter-spacing: -2px; }",
    ".wc-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 22px 0 18px; }",
    ".wc-metric { width: 49%; display: inline-block; vertical-align: top; }",
    ".wc-metric + .wc-metric { border-left: 1px solid rgba(122,164,168,.2); padding-left: 18px; }",
    ".wc-value { display: flex; align-items: center; gap: 7px; font-size: 26px; font-weight: 800; line-height: 1; letter-spacing: -.04em; }",
    ".wc-online-dot { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: #ceff68; box-shadow: 0 0 10px rgba(206,255,104,.55); }",
    ".wc-caption { margin-top: 7px; color: #78959b; font-size: 10px; }",
    ".wc-label { padding: 10px 0 7px; border-top: 1px solid rgba(122,164,168,.16); color: #69858b; font: 700 9px monospace; letter-spacing: .09em; }",
    ".wc-list { list-style: none; margin: 0; padding: 0; }",
    ".wc-list li { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; min-height: 48px; border-top: 1px solid rgba(122,164,168,.11); }",
    ".wc-flag { display: inline-block; width: 28px; font-size: 18px; }",
    ".wc-place { display: inline-block; min-width: 135px; }",
    ".wc-place strong, .wc-place small { display: block; }",
    ".wc-place strong { font-size: 11px; }",
    ".wc-place small, .wc-time { color: #708c92; font-size: 9px; }",
    ".wc-empty { display: block !important; padding: 18px 0; color: #708c92; font-size: 11px; text-align: center; }",
    ".wc-footer { margin-top: 7px; padding-top: 11px; border-top: 1px solid rgba(122,164,168,.14); color: #69858b; font-size: 9px; }",
    ".wc-footer strong { color: #32bec6; }",
    ".wc-status { color: #86a961; }",
    ".wc-status.warning { color: #d09a42; }",
    ".wc-status.error { color: #d46e61; }",
    ".light .wc-live, .light .wc-footer strong { color: #087c85; }",
    ".light .wc-place small, .light .wc-time, .light .wc-label, .light .wc-footer, .light .wc-caption { color: #5d777b; }",
    "@supports (display: grid) { .wc-metric { width: auto; display: block; } }",
    "@media (max-width: 380px) { .wc-card { padding: 15px; } .wc-value { font-size: 23px; } }",
    "</style>",
    '<section class="wc-card ', theme, '" aria-label="Live website traffic">',
    '<div class="wc-top"><span class="wc-live"><i></i> LIVE TRAFFIC</span><span class="wc-signal" aria-hidden="true">▂▄▆█</span></div>',
    '<div class="wc-metrics">',
    '<div class="wc-metric"><div class="wc-value" data-visits>—</div><div class="wc-caption">Total visits</div></div>',
    '<div class="wc-metric"><div class="wc-value"><i class="wc-online-dot"></i><span data-online>—</span></div><div class="wc-caption">Online now</div></div>',
    "</div>",
    '<div class="wc-label"><span>RECENT VISITORS</span><span>LIVE</span></div>',
    '<ul class="wc-list" data-list><li class="wc-empty">Loading recent activity…</li></ul>',
    '<div class="wc-footer"><span>Powered by <strong>WebCounter</strong></span><span class="wc-status">● Live</span></div>',
    "</section>"
  ].join("");

  var visitsNode = root.querySelector("[data-visits]");
  var onlineNode = root.querySelector("[data-online]");
  var listNode = root.querySelector("[data-list]");
  var statusNode = root.querySelector(".wc-status");
  var eventState = "live";
  var backupImages = [];

  function createRandomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var values = new Uint32Array(4);
      window.crypto.getRandomValues(values);
      return "wc-" + Array.prototype.map.call(values, function (value) {
        return value.toString(16);
      }).join("-");
    }
    return "wc-" + new Date().getTime().toString(36) + "-" +
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function getVisitorId() {
    var key = "webcounter:" + siteId + ":visitor";
    var value;
    try {
      value = window.localStorage && window.localStorage.getItem(key);
      if (!value) {
        value = createRandomId();
        if (window.localStorage) window.localStorage.setItem(key, value);
      }
      return value;
    } catch (error) {
      return createRandomId();
    }
  }

  var visitorId = getVisitorId();

  function codePointCharacter(codePoint) {
    if (codePoint <= 65535) return String.fromCharCode(codePoint);
    codePoint -= 65536;
    return String.fromCharCode(55296 + (codePoint >> 10), 56320 + (codePoint & 1023));
  }

  function countryFlag(code) {
    code = String(code || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "🌐";
    return codePointCharacter(127397 + code.charCodeAt(0)) +
      codePointCharacter(127397 + code.charCodeAt(1));
  }

  function timeAgo(epochSeconds) {
    var seconds = Math.max(0, Math.floor(new Date().getTime() / 1000) - Number(epochSeconds || 0));
    if (seconds < 60) return "now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
    return Math.floor(seconds / 86400) + "d";
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function render(stats) {
    visitsNode.textContent = Number(stats.totalVisits || 0).toLocaleString();
    onlineNode.textContent = Number(stats.onlineNow || 0).toLocaleString();
    clearNode(listNode);
    var visitors = stats.recentVisitors || [];
    if (!visitors.length) {
      var empty = document.createElement("li");
      empty.className = "wc-empty";
      empty.textContent = "No recent visits yet.";
      listNode.appendChild(empty);
      return;
    }

    visitors.slice(0, visitorLimit).forEach(function (visitor) {
      var item = document.createElement("li");
      var flag = document.createElement("span");
      flag.className = "wc-flag";
      flag.textContent = countryFlag(visitor.countryCode);
      var place = document.createElement("span");
      place.className = "wc-place";
      var city = document.createElement("strong");
      city.textContent = visitor.city || "Unknown city";
      var country = document.createElement("small");
      country.textContent = visitor.countryName || visitor.countryCode || "Unknown country";
      place.appendChild(city);
      place.appendChild(country);
      var time = document.createElement("time");
      time.className = "wc-time";
      time.textContent = timeAgo(visitor.visitedAt);
      item.appendChild(flag);
      item.appendChild(place);
      item.appendChild(time);
      listNode.appendChild(item);
    });
  }

  function setStatus(text, state) {
    eventState = state || "live";
    statusNode.className = "wc-status" + (eventState === "live" ? "" : " " + eventState);
    statusNode.textContent = text;
    statusNode.title = eventState === "error"
      ? "Open the browser console or WebCounter diagnostics for details."
      : "";
  }

  function reportDiagnostic(detail) {
    if (window.console && console.warn && detail.outcome !== "accepted") {
      console.warn("WebCounter:", detail.message || detail.outcome);
    }
    try {
      var event;
      if (typeof window.CustomEvent === "function") {
        event = new CustomEvent("webcounter:diagnostic", { detail: detail });
      } else {
        event = document.createEvent("CustomEvent");
        event.initCustomEvent("webcounter:diagnostic", false, false, detail);
      }
      window.dispatchEvent(event);
    } catch (error) {}
  }

  function encodeForm(values) {
    var parts = [];
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(values[key])));
      }
    }
    return parts.join("&");
  }

  function baseEvent(type) {
    return {
      siteId: siteId,
      visitorId: visitorId,
      eventId: createRandomId(),
      type: type,
      page: String(window.location.pathname || "/").slice(0, 500),
      filterBots: filterBots ? "true" : "false",
      transport: "xhr"
    };
  }

  function finishBackupImage(image) {
    for (var index = backupImages.length - 1; index >= 0; index -= 1) {
      if (backupImages[index] === image) backupImages.splice(index, 1);
    }
  }

  function sendFallback(payload, callback) {
    var beaconPayload = {};
    var key;
    for (key in payload) beaconPayload[key] = payload[key];
    beaconPayload.transport = "beacon";

    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(apiUrl + "/api/events", encodeForm(beaconPayload))) {
          setStatus("◌ Backup sent", "warning");
          reportDiagnostic({ outcome: "backup", transport: "beacon", message: "Primary request failed; backup beacon queued." });
          if (callback) callback(true);
          return;
        }
      } catch (error) {}
    }

    var pixelPayload = {};
    for (key in payload) pixelPayload[key] = payload[key];
    pixelPayload.transport = "pixel";
    pixelPayload.cache = new Date().getTime();
    var image = new Image(1, 1);
    backupImages.push(image);
    image.onload = function () {
      finishBackupImage(image);
      setStatus("● Live", "live");
      reportDiagnostic({ outcome: "accepted", transport: "pixel", message: "Pixel backup delivered." });
    };
    image.onerror = function () {
      finishBackupImage(image);
      setStatus("○ Blocked", "error");
      reportDiagnostic({ outcome: "blocked", transport: "pixel", message: "All event transports were blocked." });
    };
    image.src = apiUrl + "/api/events/pixel.gif?" + encodeForm(pixelPayload);
    setStatus("◌ Retrying", "warning");
    if (callback) callback(true);
  }

  function sendEvent(type, callback) {
    var payload = baseEvent(type);
    var request = new XMLHttpRequest();
    var completed = false;

    function fallback() {
      if (completed) return;
      completed = true;
      sendFallback(payload, callback);
    }

    try {
      request.open("POST", apiUrl + "/api/events", true);
      request.timeout = 6000;
      request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
      request.onreadystatechange = function () {
        if (request.readyState !== 4 || completed) return;
        completed = true;
        if (request.status >= 200 && request.status < 300) {
          var result = {};
          try { result = JSON.parse(request.responseText || "{}"); } catch (error) {}
          if (result.filtered) {
            setStatus("● Bot filtered", "live");
          } else {
            setStatus("● Live", "live");
          }
          if (callback) callback(true);
          return;
        }
        if (request.status >= 400 && request.status < 500) {
          setStatus("⚠ Rejected", "error");
          reportDiagnostic({ outcome: "rejected", status: request.status, message: "Event rejected by the WebCounter API (HTTP " + request.status + ")." });
          if (callback) callback(false);
          return;
        }
        completed = false;
        fallback();
      };
      request.onerror = fallback;
      request.ontimeout = fallback;
      request.send(encodeForm(payload));
    } catch (error) {
      fallback();
    }
  }

  function refresh() {
    var request = new XMLHttpRequest();
    try {
      request.open("GET", apiUrl + "/api/sites/" + encodeURIComponent(siteId) + "/stats?cache=" + new Date().getTime(), true);
      request.timeout = 6000;
      request.onreadystatechange = function () {
        if (request.readyState !== 4) return;
        if (request.status >= 200 && request.status < 300) {
          try {
            render(JSON.parse(request.responseText));
            if (eventState !== "error" && eventState !== "warning") setStatus("● Live", "live");
          } catch (error) {
            setStatus("○ Offline", "error");
          }
        } else if (request.status !== 0) {
          setStatus("○ Offline", "error");
        }
      };
      request.onerror = function () { setStatus("○ Offline", "error"); };
      request.ontimeout = function () { setStatus("○ Offline", "error"); };
      request.send();
    } catch (error) {
      setStatus("○ Offline", "error");
    }
  }

  sendEvent("view", refresh);
  var refreshTimer = window.setInterval(refresh, 15000);
  var heartbeatTimer = window.setInterval(function () {
    if (!document.visibilityState || document.visibilityState === "visible") sendEvent("heartbeat");
  }, 25000);

  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        sendEvent("heartbeat");
        refresh();
      }
    }, false);
    window.addEventListener("pagehide", function () {
      window.clearInterval(refreshTimer);
      window.clearInterval(heartbeatTimer);
    }, false);
  }
}());
