/*!
 * Heimdell Verified Consent -- CRM Widget v1.1
 * Production-safe browser widget. Requires a short-lived embed token issued by
 * the client backend. Never put server API keys in browser code.
 */
(function () {
  "use strict";

  if (window.__hvcsWidget) return;
  window.__hvcsWidget = true;

  var tag =
    document.currentScript ||
    (function () {
      var tags = document.getElementsByTagName("script");
      return tags[tags.length - 1];
    })();

  var globalConfig = window.HeimdellWidgetConfig || {};
  var scriptSrc = (tag && tag.src) || "";
  var inferredBaseUrl =
    scriptSrc.indexOf("/widget.js") !== -1
      ? scriptSrc.slice(0, scriptSrc.indexOf("/widget.js"))
      : window.location.origin;

  var config = {
    heimdellBaseUrl:
      globalConfig.heimdellBaseUrl ||
      (tag && tag.getAttribute("data-base-url")) ||
      inferredBaseUrl,
    mode:
      globalConfig.mode || (tag && tag.getAttribute("data-mode")) || "deal",
    targetId:
      globalConfig.targetId ||
      (tag && tag.getAttribute("data-target-id")) ||
      (tag && tag.getAttribute("data-session-id")) ||
      (tag && tag.getAttribute("data-client-ref")) ||
      "",
    embedToken:
      globalConfig.embedToken ||
      (tag && tag.getAttribute("data-embed-token")) ||
      "",
    container:
      globalConfig.container || (tag && tag.getAttribute("data-container")) || "",
    position:
      globalConfig.position ||
      (tag && tag.getAttribute("data-position")) ||
      "bottom-right",
    refreshIntervalSeconds: Number(
      globalConfig.refreshIntervalSeconds ||
        (tag && tag.getAttribute("data-refresh-interval")) ||
        0
    ),
  };

  if (globalConfig.apiKey || (tag && tag.getAttribute("data-api-key"))) {
    console.warn(
      "[Heimdell] Refusing widget config: browser API credentials are not allowed. Use a short-lived embed token."
    );
    return;
  }

  var isVerification = config.mode === "verification";
  var isDeal = config.mode === "deal";

  if (!isVerification && !isDeal) {
    console.warn("[Heimdell] Invalid widget mode. Use 'verification' or 'deal'.");
    return;
  }

  var CSS = [
    ".hvcs-widget{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a}",
    ".hvcs-panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.12);overflow:hidden}",
    ".hvcs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #f1f5f9;background:#f8fafc}",
    ".hvcs-brand{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0284c7}",
    ".hvcs-body{padding:12px}.hvcs-title{font-size:13px;font-weight:700;margin:0 0 8px}",
    ".hvcs-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f8fafc}.hvcs-row:last-child{border-bottom:0}",
    ".hvcs-label{font-size:11px;color:#94a3b8}.hvcs-value{font-size:12px;font-weight:600;text-align:right;word-break:break-word}",
    ".hvcs-badge{display:inline-flex;align-items:center;border-radius:999px;border:1px solid #e2e8f0;padding:3px 8px;font-size:11px;font-weight:700;background:#f8fafc;color:#475569}",
    ".hvcs-badge.COMPLETED,.hvcs-badge.VERIFIED{border-color:#bbf7d0;background:#f0fdf4;color:#15803d}",
    ".hvcs-badge.DECLINED,.hvcs-badge.FAILED{border-color:#fecaca;background:#fef2f2;color:#b91c1c}",
    ".hvcs-badge.EXPIRED{border-color:#fde68a;background:#fffbeb;color:#b45309}",
    ".hvcs-badge.OPENED{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}",
    ".hvcs-error{border-color:#fecaca;background:#fef2f2;color:#991b1b}.hvcs-muted{font-size:11px;color:#64748b;line-height:1.45}",
    "#hvcs-float{position:fixed;z-index:2147483640;width:360px;max-width:calc(100vw - 32px)}",
    "#hvcs-float.bottom-right{right:16px;bottom:16px}#hvcs-float.bottom-left{left:16px;bottom:16px}",
  ].join("");

  function appendStyle() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function safeText(value) {
    if (value === null || value === undefined || value === "") return "Not recorded";
    return String(value);
  }

  function formatDate(value) {
    if (!value) return "Not recorded";
    try {
      return new Date(value).toLocaleString();
    } catch (_err) {
      return "Not recorded";
    }
  }

  function row(label, value) {
    return (
      '<div class="hvcs-row"><span class="hvcs-label">' +
      label +
      '</span><span class="hvcs-value">' +
      safeText(value) +
      "</span></div>"
    );
  }

  function statusBadge(status) {
    var safeStatus = safeText(status).replace(/[^A-Z_]/g, "");
    return '<span class="hvcs-badge ' + safeStatus + '">' + safeText(status) + "</span>";
  }

  function renderShell(content, isError) {
    return (
      '<div class="hvcs-widget"><div class="hvcs-panel ' +
      (isError ? "hvcs-error" : "") +
      '"><div class="hvcs-head"><span class="hvcs-brand">Heimdell</span>' +
      statusBadge(isError ? "ERROR" : "SECURE") +
      '</div><div class="hvcs-body">' +
      content +
      "</div></div></div>"
    );
  }

  function renderError(message) {
    root.innerHTML = renderShell(
      '<p class="hvcs-title">Consent status unavailable</p><p class="hvcs-muted">' +
        message +
        "</p>",
      true
    );
  }

  function renderStatus(data) {
    var status = data.verification_status || data.latest_verification_status || data.sale_status;
    var content =
      '<p class="hvcs-title">Consent status ' +
      statusBadge(status || "UNKNOWN") +
      "</p>" +
      row("Client reference", data.client_reference) +
      row("Product", data.product_name) +
      row("Sale status", data.sale_status) +
      row("Verification status", data.verification_status || data.latest_verification_status) +
      row("Created", formatDate(data.created_at || data.sale_created_at || data.latest_verification_created_at)) +
      row("Completed", formatDate(data.completed_at || data.latest_verification_completed_at)) +
      row("Declined", formatDate(data.declined_at || data.latest_verification_declined_at)) +
      row("Certificate", data.certificate_id);

    root.innerHTML = renderShell(content, false);
  }

  function endpoint() {
    var base = config.heimdellBaseUrl.replace(/\/$/, "");
    var encodedTarget = encodeURIComponent(config.targetId);
    return isVerification
      ? base + "/api/v1/embed/verification/" + encodedTarget + "/status"
      : base + "/api/v1/embed/deal/" + encodedTarget + "/status";
  }

  function loadStatus() {
    if (!config.targetId) {
      renderError("Missing widget target. Provide targetId, data-target-id, data-session-id, or data-client-ref.");
      return;
    }

    if (!config.embedToken) {
      renderError("A short-lived embed token is required. Ask your CRM backend to issue one for this target.");
      return;
    }

    fetch(endpoint(), {
      headers: { Authorization: "Bearer " + config.embedToken },
      credentials: "omit",
    })
      .then(function (response) {
        if (response.status === 401) {
          throw new Error("The embed token is missing, invalid, or expired.");
        }
        if (!response.ok) {
          throw new Error("Consent status is unavailable.");
        }
        return response.json();
      })
      .then(renderStatus)
      .catch(function (error) {
        renderError(error.message || "Consent status is unavailable.");
      });
  }

  appendStyle();

  var root;
  if (config.container) {
    root = document.querySelector(config.container);
    if (!root) {
      console.warn("[Heimdell] Widget container not found.");
      return;
    }
  } else {
    root = document.createElement("div");
    root.id = "hvcs-float";
    root.className = config.position === "bottom-left" ? "bottom-left" : "bottom-right";
    document.body.appendChild(root);
  }

  root.innerHTML = renderShell('<p class="hvcs-title">Loading consent status...</p>', false);
  loadStatus();

  if (config.refreshIntervalSeconds >= 60) {
    window.setInterval(loadStatus, config.refreshIntervalSeconds * 1000);
  }

  window.HeimdellWidget = {
    refresh: loadStatus,
  };
})();
