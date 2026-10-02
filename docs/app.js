(() => {
  const config = window.WEBCOUNTER_CONFIG || {};
  const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
  const isConfigured = apiUrl && !apiUrl.includes("YOUR-SUBDOMAIN");
  const form = document.querySelector("#widget-form");
  const message = document.querySelector("#form-message");
  const serviceState = document.querySelector("#service-state");
  const codePanel = document.querySelector("#code-panel");
  const embedCode = document.querySelector("#embed-code");
  const copyButton = document.querySelector("#copy-button");
  const diagnosticsRefresh = document.querySelector("#diagnostics-refresh");
  const diagnosticsSummary = document.querySelector("#diagnostic-summary");
  const diagnosticsList = document.querySelector("#diagnostic-list");
  const preview = document.querySelector("#widget-preview");
  const previewList = document.querySelector("#preview-visitors");
  const widthInput = document.querySelector("#widget-width");
  const visitorInput = document.querySelector("#visitor-count");
  const widthOutput = document.querySelector("#width-output");
  const visitorOutput = document.querySelector("#visitor-output");
  const submitButton = form.querySelector("button[type='submit']");
  const widgetUrl = new URL("widget.js", window.location.href).href;
  let currentSiteId = "";
  const sampleVisitors = [
    ["🇲🇾", "Kuala Lumpur", "Malaysia", "now"],
    ["🇬🇧", "London", "United Kingdom", "1m"],
    ["🇯🇵", "Tokyo", "Japan", "3m"],
    ["🇦🇺", "Sydney", "Australia", "6m"],
    ["🇸🇬", "Singapore", "Singapore", "8m"],
    ["🇺🇸", "New York", "United States", "12m"],
    ["🇮🇩", "Jakarta", "Indonesia", "14m"],
    ["🇩🇪", "Berlin", "Germany", "17m"],
    ["🇨🇦", "Toronto", "Canada", "21m"],
    ["🇫🇷", "Paris", "France", "26m"],
    ["🇹🇭", "Bangkok", "Thailand", "31m"],
    ["🇦🇪", "Dubai", "United Arab Emirates", "36m"],
    ["🇰🇷", "Seoul", "South Korea", "42m"],
    ["🇮🇳", "Mumbai", "India", "48m"],
    ["🇳🇱", "Amsterdam", "Netherlands", "55m"],
    ["🇧🇷", "São Paulo", "Brazil", "1h"],
    ["🇪🇸", "Madrid", "Spain", "1h"],
    ["🇳🇿", "Auckland", "New Zealand", "2h"],
    ["🇸🇪", "Stockholm", "Sweden", "2h"],
    ["🇵🇭", "Manila", "Philippines", "3h"],
  ];

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function renderPreviewVisitors(count) {
    previewList.replaceChildren();
    sampleVisitors.slice(0, count).forEach(([flagText, cityText, countryText, timeText]) => {
      const item = document.createElement("li");
      const flag = document.createElement("span");
      flag.className = "flag";
      flag.textContent = flagText;
      const place = document.createElement("span");
      const city = document.createElement("strong");
      city.textContent = cityText;
      const country = document.createElement("small");
      country.textContent = countryText;
      place.append(city, country);
      const time = document.createElement("time");
      time.textContent = timeText;
      item.append(flag, place, time);
      previewList.append(item);
    });
  }

  function updatePreviewOptions() {
    const width = clampNumber(widthInput.value, 220, 300, 300);
    const visitors = clampNumber(visitorInput.value, 1, 20, 6);
    widthOutput.textContent = `${width} px`;
    visitorOutput.textContent = String(visitors);
    preview.style.width = `${width}px`;
    renderPreviewVisitors(visitors);
  }

  function setServiceState(state, label) {
    serviceState.className = `service-state ${state}`;
    serviceState.querySelector("span").textContent = label;
  }

  function diagnosticLabel(entry) {
    if (entry.outcome === "accepted") return entry.likelyBot ? "Accepted bot" : "Accepted";
    if (entry.outcome === "filtered") return "Bot filtered";
    if (entry.reason === "origin_mismatch") return "Wrong domain";
    if (entry.reason === "invalid_visitor") return "Invalid visitor";
    return "Rejected";
  }

  function diagnosticTime(epochSeconds) {
    return new Date(Number(epochSeconds) * 1000).toLocaleString();
  }

  async function loadDiagnostics() {
    if (!currentSiteId) return;
    diagnosticsRefresh.disabled = true;
    diagnosticsRefresh.textContent = "Loading…";
    try {
      const response = await fetch(`${apiUrl}/api/sites/${encodeURIComponent(currentSiteId)}/diagnostics`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load diagnostics");
      diagnosticsSummary.innerHTML = `
        <span><strong>${Number(data.summary.accepted || 0).toLocaleString()}</strong>Accepted</span>
        <span><strong>${Number(data.summary.filteredBots || 0).toLocaleString()}</strong>Bots filtered</span>
        <span><strong>${Number(data.summary.rejected || 0).toLocaleString()}</strong>Rejected</span>`;
      diagnosticsList.replaceChildren();
      if (!data.recent?.length) {
        const empty = document.createElement("p");
        empty.textContent = "No diagnostic events yet. New page views will appear here.";
        diagnosticsList.append(empty);
        return;
      }
      data.recent.forEach((entry) => {
        const row = document.createElement("div");
        row.className = `diagnostic-row ${entry.outcome}`;
        const outcome = document.createElement("strong");
        outcome.textContent = diagnosticLabel(entry);
        const path = document.createElement("code");
        path.textContent = entry.page || "/";
        const details = document.createElement("span");
        details.textContent = `${entry.browserFamily || "Unknown"} · ${entry.transport || "unknown"} · ${diagnosticTime(entry.occurredAt)}`;
        row.append(outcome, path, details);
        diagnosticsList.append(row);
      });
    } catch (error) {
      diagnosticsList.innerHTML = `<p>${error.message || "Diagnostics are currently unavailable."}</p>`;
    } finally {
      diagnosticsRefresh.disabled = false;
      diagnosticsRefresh.textContent = "Refresh";
    }
  }

  async function checkService() {
    if (!isConfigured) {
      setServiceState("offline", "Backend setup pending");
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error("Unavailable");
      setServiceState("online", "Service online");
    } catch {
      setServiceState("offline", "Service unavailable");
    }
  }

  document.querySelectorAll("input[name='theme']").forEach((input) => {
    input.addEventListener("change", () => {
      preview.classList.toggle("light", input.value === "light" && input.checked);
      preview.classList.toggle("dark", !(input.value === "light" && input.checked));
    });
  });

  widthInput.addEventListener("input", updatePreviewOptions);
  visitorInput.addEventListener("input", updatePreviewOptions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "form-message";
    message.textContent = "";

    if (!isConfigured) {
      message.classList.add("error");
      message.textContent = "The landing page is ready. Deploy the included Cloudflare backend and add its address to docs/config.js to activate registration.";
      return;
    }

    const formData = new FormData(form);
    const domain = String(formData.get("domain") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const theme = String(formData.get("theme") || "dark");
    const width = clampNumber(formData.get("width"), 220, 300, 300);
    const visitors = clampNumber(formData.get("visitors"), 1, 20, 6);
    const filterBots = formData.get("filterBots") === "true";
    submitButton.disabled = true;
    submitButton.querySelector("span:first-child").textContent = "Creating…";

    try {
      const response = await fetch(`${apiUrl}/api/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create widget");

      const snippet = `<script async src="${widgetUrl}" data-site="${data.site.id}" data-api="${apiUrl}" data-theme="${theme}" data-width="${width}" data-visitors="${visitors}" data-filter-bots="${filterBots}"><\/script>`;
      embedCode.textContent = snippet;
      currentSiteId = data.site.id;
      codePanel.hidden = false;
      codePanel.scrollIntoView({ behavior: "smooth", block: "center" });
      message.textContent = data.existing ? "Existing widget found for this domain." : "Widget created successfully.";
      loadDiagnostics();
    } catch (error) {
      message.classList.add("error");
      message.textContent = error.message || "The service could not create your widget. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector("span:first-child").textContent = "Create my counter";
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(embedCode.textContent);
      copyButton.textContent = "Copied to clipboard";
      setTimeout(() => { copyButton.textContent = "Copy embed code"; }, 1800);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(embedCode);
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = "Code selected — press Ctrl/Cmd+C";
    }
  });

  diagnosticsRefresh.addEventListener("click", loadDiagnostics);

  updatePreviewOptions();
  checkService();
})();
