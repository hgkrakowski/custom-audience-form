const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 8787);
const ROKT_ENDPOINT = process.env.ROKT_ENDPOINT || "https://data.rokt.com/v3/import/suppression";
const MAX_IDENTIFIERS = 100000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/upload-custom-audience") {
      await handleUpload(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Audience CSV Builder running at http://127.0.0.1:${PORT}`);
});

async function handleUpload(req, res) {
  const body = await readJsonBody(req);
  const jwtToken = normalizeJwt(body.jwtToken || process.env.ROKT_JWT || "");
  const identifiers = Array.isArray(body.identifiers) ? body.identifiers : [];
  const action = body.action === "exclude" ? "exclude" : "include";
  const list = cleanListName(body.list);
  const accountId = String(body.accountId || process.env.ROKT_ACCOUNT_ID || "").trim();

  if (!jwtToken) {
    sendJson(res, 400, {
      error: "Enter a JWT in the form, or set ROKT_JWT in .env.",
    });
    return;
  }

  if (!accountId) {
    sendJson(res, 400, { error: "Account ID is required." });
    return;
  }

  if (identifiers.length === 0) {
    sendJson(res, 400, { error: "No identifiers to upload." });
    return;
  }

  if (identifiers.length > MAX_IDENTIFIERS) {
    sendJson(res, 400, { error: `Rokt recommends no more than ${MAX_IDENTIFIERS} identifiers per request.` });
    return;
  }

  const payload = {
    accountId,
    list,
    action,
    emails: identifiers,
  };

  const response = await fetch(ROKT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    sendJson(res, response.status, {
      error: responseText || `Rokt returned ${response.status}.`,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    count: identifiers.length,
    list,
    action,
    roktStatus: response.status,
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    if (req.method !== "HEAD") res.end(contents);
    else res.end();
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 12 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function normalizeJwt(value) {
  return String(value || "").trim().replace(/^Bearer\s+/i, "");
}

function cleanListName(value) {
  return String(value || "audience")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "audience";
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}
