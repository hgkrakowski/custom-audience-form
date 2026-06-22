const els = {
  form: document.querySelector("#audienceForm"),
  audienceName: document.querySelector("#audienceName"),
  accountId: document.querySelector("#accountId"),
  jwtToken: document.querySelector("#jwtToken"),
  emailInput: document.querySelector("#emailInput"),
  fileInput: document.querySelector("#fileInput"),
  headerToggle: document.querySelector("#headerToggle"),
  saveSettingsToggle: document.querySelector("#saveSettingsToggle"),
  downloadButton: document.querySelector("#downloadButton"),
  copyEmailsButton: document.querySelector("#copyEmailsButton"),
  uploadButton: document.querySelector("#uploadButton"),
  copyInvalidButton: document.querySelector("#copyInvalidButton"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  copyCurlButton: document.querySelector("#copyCurlButton"),
  clearButton: document.querySelector("#clearButton"),
  uploadStatus: document.querySelector("#uploadStatus"),
  validCount: document.querySelector("#validCount"),
  duplicateCount: document.querySelector("#duplicateCount"),
  invalidCount: document.querySelector("#invalidCount"),
  previewTable: document.querySelector("#previewTable"),
  payloadPreview: document.querySelector("#payloadPreview"),
  curlPreview: document.querySelector("#curlPreview"),
  toast: document.querySelector("#toast"),
};

const STORAGE_KEY = "audienceCsvBuilderSettings";
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const state = {
  valid: [],
  invalid: [],
  duplicates: [],
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (typeof saved.audienceName === "string") els.audienceName.value = saved.audienceName;
    if (typeof saved.accountId === "string") els.accountId.value = saved.accountId;
    if (typeof saved.includeHeader === "boolean") els.headerToggle.checked = saved.includeHeader;
    if (typeof saved.action === "string") {
      const actionInput = document.querySelector(`input[name="action"][value="${saved.action}"]`);
      if (actionInput) actionInput.checked = true;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveSettings() {
  if (!els.saveSettingsToggle.checked) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const settings = {
    audienceName: els.audienceName.value.trim(),
    accountId: els.accountId.value.trim(),
    includeHeader: els.headerToggle.checked,
    action: getAction(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getAction() {
  return document.querySelector('input[name="action"]:checked')?.value || "include";
}

function slugify(value, fallback = "audience") {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || fallback;
}

function splitTokens(text) {
  return text
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(/^\uFEFF/, "").replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function parseEmails(text) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  splitTokens(text).forEach((token, index) => {
    if (index === 0 && /^(email|emails|email_address|emailaddress)$/i.test(token)) {
      return;
    }

    const normalized = token.toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      invalid.push(token);
      return;
    }

    if (seen.has(normalized)) {
      duplicates.push(normalized);
      return;
    }

    seen.add(normalized);
    valid.push(normalized);
  });

  return { valid, invalid, duplicates };
}

function escapeCsvCell(value) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function refreshState() {
  const parsed = parseEmails(els.emailInput.value);
  state.valid = parsed.valid;
  state.invalid = parsed.invalid;
  state.duplicates = parsed.duplicates;

  els.validCount.textContent = state.valid.length;
  els.duplicateCount.textContent = state.duplicates.length;
  els.invalidCount.textContent = state.invalid.length;
  els.downloadButton.disabled = state.valid.length === 0;
  els.copyEmailsButton.disabled = state.valid.length === 0;
  els.uploadButton.disabled = state.valid.length === 0;
  els.copyInvalidButton.disabled = state.invalid.length === 0;
  els.copyPayloadButton.disabled = state.valid.length === 0;
  els.copyCurlButton.disabled = state.valid.length === 0;

  renderPreview();
  renderPayload();
  saveSettings();
}

function getExportValues() {
  return state.valid;
}

function getColumnName() {
  return "email";
}

function buildCsv() {
  const rows = getExportValues().map((value) => escapeCsvCell(value));
  if (els.headerToggle.checked) rows.unshift(getColumnName());
  return `${rows.join("\n")}\n`;
}

function buildPayload() {
  const audienceName = slugify(els.audienceName.value, "audience");
  const action = getAction();
  const addToAudience = action === "include";
  const userAttributeKey = `audience_${audienceName}`;
  const emails = state.valid;

  return {
    eventAudienceApi: emails.map((email) => ({
      environment: "production",
      user_identities: { email },
      user_attributes: {
        [userAttributeKey]: addToAudience,
      },
    })),
    deprecatedCustomAudienceApi: {
      accountId: els.accountId.value.trim() || "REPLACE_ME",
      list: audienceName,
      action,
      emails: getExportValues(),
    },
  };
}

function buildCurl() {
  const payload = buildPayload().deprecatedCustomAudienceApi;
  return String.raw`curl -X POST https://data.rokt.com/v3/import/suppression \
  --header "Authorization: Bearer JWT_FROM_FORM" \
  --header "Content-Type: application/json" \
  --data '${JSON.stringify(payload)}'`;
}

function buildUploadRequest() {
  const audienceName = slugify(els.audienceName.value, "audience");
  return {
    accountId: els.accountId.value.trim(),
    jwtToken: els.jwtToken.value.trim(),
    list: audienceName,
    action: getAction(),
    identifiers: getExportValues(),
  };
}

function renderPreview() {
  if (state.valid.length === 0 && state.invalid.length === 0) {
    els.previewTable.innerHTML = '<div class="empty-state">Paste emails to preview the cleaned list.</div>';
    return;
  }

  const rows = [
    '<div class="preview-head" role="row"><span>#</span><span>Email</span></div>',
    ...state.valid.slice(0, 250).map((email, index) => (
      `<div class="preview-row" role="row"><span>${index + 1}</span><span>${escapeHtml(email)}</span></div>`
    )),
  ];

  if (state.valid.length > 250) {
    rows.push(`<div class="preview-row" role="row"><span></span><span>${state.valid.length - 250} more ready emails</span></div>`);
  }

  state.invalid.slice(0, 25).forEach((item) => {
    rows.push(`<div class="preview-row invalid-line" role="row"><span>!</span><span>${escapeHtml(item)}</span></div>`);
  });

  if (state.invalid.length > 25) {
    rows.push(`<div class="preview-row invalid-line" role="row"><span>!</span><span>${state.invalid.length - 25} more invalid entries</span></div>`);
  }

  els.previewTable.innerHTML = rows.join("");
}

function renderPayload() {
  if (state.valid.length === 0) {
    els.payloadPreview.textContent = "{}";
    els.curlPreview.textContent = "";
    return;
  }

  els.payloadPreview.textContent = JSON.stringify(buildPayload(), null, 2);
  els.curlPreview.textContent = buildCurl();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadCsv() {
  if (state.valid.length === 0) return;

  const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const name = slugify(els.audienceName.value, "audience");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `${name}_${stamp}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded.");
}

async function copyText(value, successMessage) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  showToast(successMessage);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function setUploadStatus(message, kind = "") {
  els.uploadStatus.textContent = message;
  els.uploadStatus.className = `upload-status ${kind}`.trim();
}

function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const scheduleRefresh = debounce(refreshState);

els.form.addEventListener("input", scheduleRefresh);
els.form.addEventListener("change", scheduleRefresh);
els.downloadButton.addEventListener("click", downloadCsv);
els.uploadButton.addEventListener("click", uploadToRokt);
els.copyEmailsButton.addEventListener("click", () => copyText(state.valid.join("\n"), "Emails copied."));
els.copyInvalidButton.addEventListener("click", () => copyText(state.invalid.join("\n"), "Invalid entries copied."));
els.copyPayloadButton.addEventListener("click", () => copyText(els.payloadPreview.textContent, "JSON copied."));
els.copyCurlButton.addEventListener("click", () => copyText(els.curlPreview.textContent, "Command copied."));
els.clearButton.addEventListener("click", () => {
  els.emailInput.value = "";
  refreshState();
  els.emailInput.focus();
});

els.fileInput.addEventListener("change", async () => {
  const [file] = els.fileInput.files;
  if (!file) return;

  const text = await file.text();
  const separator = els.emailInput.value.trim() ? "\n" : "";
  els.emailInput.value = `${els.emailInput.value.trim()}${separator}${text}`;
  els.fileInput.value = "";
  refreshState();
  showToast("File imported.");
});

async function uploadToRokt() {
  if (state.valid.length === 0) return;

  if (window.location.protocol === "file:") {
    setUploadStatus("Open the local server URL to upload to Rokt.", "error");
    return;
  }

  setUploadStatus("Uploading...");
  els.uploadButton.disabled = true;

  try {
    const response = await fetch("/api/upload-custom-audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildUploadRequest()),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Upload failed with ${response.status}.`);
    }

    setUploadStatus(`Uploaded ${result.count || state.valid.length} identifiers to ${result.list}.`, "success");
    showToast("Rokt upload complete.");
  } catch (error) {
    setUploadStatus(error.message || "Upload failed.", "error");
  } finally {
    els.uploadButton.disabled = state.valid.length === 0;
  }
}

loadSettings();
refreshState();
