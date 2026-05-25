// N_145. Read-only proxy for Yandex.Disk REST API.
// Supports only reading operations:
//   action=list     -> list files/folders in a Yandex.Disk directory
//   action=download -> return a temporary download URL for one file
//   action=content  -> proxy file bytes through the Edge Function for client-side ZIP creation

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizePathSeparators(value: string) {
  return String(value || "").trim().replace(/\\+/g, "/").replace(/\/+/g, "/");
}

function toYandexDiskPath(rawPath: string) {
  const normalized = normalizePathSeparators(rawPath);
  if (!normalized) return "";
  if (normalized.startsWith("/")) return normalized;

  const markers = ["Для Технического заказчика", "Внутренняя Технологии", "Программные файлы", "Папка ГИПа"];
  const lower = normalized.toLowerCase();

  for (const marker of markers) {
    const index = lower.indexOf(marker.toLowerCase());
    if (index >= 0) {
      return `/${normalized.slice(index).replace(/^\/+/, "")}`;
    }
  }

  return normalized;
}

async function yandexGet(path: string, token: string) {
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/${path}`, {
    method: "GET",
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = String(data.message || data.description || data.error || `Yandex.Disk HTTP ${response.status}`);
    throw new Error(message);
  }

  return data;
}

async function getYandexDownloadInfo(diskPath: string, token: string) {
  const params = new URLSearchParams({ path: diskPath });
  const data = await yandexGet(`resources/download?${params.toString()}`, token);
  const href = String(data.href || "");
  if (!href) {
    throw new Error("Yandex.Disk did not return a download URL.");
  }
  return { href, method: String(data.method || "GET") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const token = Deno.env.get("YANDEX_ACCESS_TOKEN") || "";
  if (!token) {
    return jsonResponse({ error: "YANDEX_ACCESS_TOKEN is not set in Supabase Edge Function secrets." }, 500);
  }

  let payload: { action?: string; path?: string; limit?: number } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const action = String(payload.action || "list").trim();
  const diskPath = toYandexDiskPath(String(payload.path || ""));

  if (!diskPath) {
    return jsonResponse({ error: "Path is empty." }, 400);
  }

  try {
    if (action === "list") {
      const limit = Math.max(1, Math.min(Number(payload.limit || 200), 500));
      const params = new URLSearchParams({
        path: diskPath,
        limit: String(limit),
        fields: "path,name,type,mime_type,modified,created,size,_embedded.items.path,_embedded.items.name,_embedded.items.type,_embedded.items.mime_type,_embedded.items.modified,_embedded.items.created,_embedded.items.size",
      });

      const data = await yandexGet(`resources?${params.toString()}`, token);
      const embedded = data._embedded as { items?: Array<Record<string, unknown>> } | undefined;
      const items = Array.isArray(embedded?.items) ? embedded.items : [];

      return jsonResponse({
        ok: true,
        action,
        path: diskPath,
        items,
      });
    }

    if (action === "download") {
      const data = await getYandexDownloadInfo(diskPath, token);
      return jsonResponse({
        ok: true,
        action,
        path: diskPath,
        href: data.href,
        method: data.method,
      });
    }

    if (action === "content") {
      const data = await getYandexDownloadInfo(diskPath, token);
      const fileResponse = await fetch(data.href, { method: data.method || "GET" });
      if (!fileResponse.ok) {
        throw new Error(`Yandex.Disk file download HTTP ${fileResponse.status}`);
      }

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", fileResponse.headers.get("Content-Type") || "application/octet-stream");
      const contentLength = fileResponse.headers.get("Content-Length");
      if (contentLength) headers.set("Content-Length", contentLength);
      return new Response(fileResponse.body, {
        status: 200,
        headers,
      });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({
      ok: false,
      action,
      path: diskPath,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
