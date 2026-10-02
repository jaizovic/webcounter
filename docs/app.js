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
  const preview = document.querySelector("#widget-preview");
  const submitButton = form.querySelector("button[type='submit']");
  const widgetUrl = new URL("widget.js", window.location.href).href;

  function setServiceState(state, label) {
    serviceState.className = `service-state ${state}`;
    serviceState.querySelector("span").textContent = label;
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

      const snippet = `<script async src="${widgetUrl}" data-site="${data.site.id}" data-api="${apiUrl}" data-theme="${theme}"><\/script>`;
      embedCode.textContent = snippet;
      codePanel.hidden = false;
      codePanel.scrollIntoView({ behavior: "smooth", block: "center" });
      message.textContent = data.existing ? "Existing widget found for this domain." : "Widget created successfully.";
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

  checkService();
})();
