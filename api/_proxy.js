// N_166. Shared Vercel proxy helper for GIP API.
// Browser calls /api/... on Vercel. Vercel forwards request to GIP_API_UPSTREAM.

const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "connection",
]);

function getUpstreamBase() {
  const raw = process.env.GIP_API_UPSTREAM || process.env.GIP_API_BASE_URL || "";
  return String(raw).trim().replace(/\/+$/g, "");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function copyRequestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if (BLOCKED_REQUEST_HEADERS.has(lower)) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value !== undefined && value !== null) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function copyResponseHeaders(upstreamResponse, res) {
  upstreamResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (BLOCKED_RESPONSE_HEADERS.has(lower)) return;
    res.setHeader(key, value);
  });
}

export async function forwardToGipApi(req, res, targetPath) {
  const upstreamBase = getUpstreamBase();
  if (!upstreamBase) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: "GIP_API_UPSTREAM is not configured in Vercel Environment Variables",
    }));
    return;
  }

  try {
    const incomingUrl = new URL(req.url || "/", "http://localhost");
    const normalizedTargetPath = String(targetPath || "").startsWith("/")
      ? String(targetPath || "")
      : `/${String(targetPath || "")}`;
    const upstreamUrl = `${upstreamBase}${normalizedTargetPath}${incomingUrl.search || ""}`;
    const method = req.method || "GET";
    const headers = copyRequestHeaders(req);
    const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    res.statusCode = upstreamResponse.status;
    copyResponseHeaders(upstreamResponse, res);
    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    res.end(responseBuffer);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: "GIP API proxy error",
      message: error?.message || String(error),
      targetPath,
    }));
  }
}
