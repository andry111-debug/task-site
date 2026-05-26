// N_149. Proxy for Yandex.Disk REST API.
// Supports reading and safe upload into the incoming queue folder:
//   action=list     -> list files/folders in a Yandex.Disk directory
//   action=download -> return a temporary download URL for one file
//   action=content  -> proxy file bytes through the Edge Function for client-side ZIP creation
//   action=upload   -> upload one base64-encoded file to Yandex.Disk

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

function trimSlashes(value: string) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function dirname(path: string) {
  const normalized = normalizePathSeparators(path);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

function parentDirs(path: string) {
  const dir = trimSlashes(dirname(path));
  if (!dir) return [] as string[];
  const parts = dir.split("/").filter(Boolean);
  const result: string[] = [];
  for (let i = 1; i <= parts.length; i += 1) {
    result.push(`/${parts.slice(0, i).join("/")}`);
  }
  return result;
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

async function parseYandexResponse(response: Response) {
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return data;
}

async function yandexGet(path: string, token: string) {
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/${path}`, {
    method: "GET",
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
    },
  });

  const data = await parseYandexResponse(response);
  if (!response.ok) {
    const message = String(data.message || data.description || data.error || `Yandex.Disk HTTP ${response.status}`);
    throw new Error(message);
  }
  return data;
}

async function yandexPutResource(diskPath: string, token: string) {
  const params = new URLSearchParams({ path: diskPath });
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?${params.toString()}`, {
    method: "PUT",
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
    },
  });

  if (response.status === 409) return;
  const data = await parseYandexResponse(response);
  if (!response.ok) {
    const message = String(data.message || data.description || data.error || `Yandex.Disk HTTP ${response.status}`);
    throw new Error(message);
  }
}

async function ensureParentFolders(diskPath: string, token: string) {
  for (const dir of parentDirs(diskPath)) {
    await yandexPutResource(dir, token);
  }
}

async function getYandexDownloadInfo(diskPath: string, token: string) {
  const params = new URLSearchParams({ path: diskPath });
  const data = await yandexGet(`resources/download?${params.toString()}`, token);
  const href = String(data.href || "");
  if (!href) throw new Error("Yandex.Disk did not return a download URL.");
  return { href, method: String(data.method || "GET") };
}

async function getYandexUploadInfo(diskPath: string, token: string, overwrite = false) {
  const params = new URLSearchParams({ path: diskPath, overwrite: overwrite ? "true" : "false" });
  const data = await yandexGet(`resources/upload?${params.toString()}`, token);
  const href = String(data.href || "");
  if (!href) throw new Error("Yandex.Disk did not return an upload URL.");
  return { href, method: String(data.method || "PUT") };
}

function base64ToBytes(value: string) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

  let payload: { action?: string; path?: string; limit?: number; file_base64?: string; content_type?: string; overwrite?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const action = String(payload.action || "list").trim();
  const diskPath = toYandexDiskPath(String(payload.path || ""));
  if (!diskPath) return jsonResponse({ error: "Path is empty." }, 400);

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
      return jsonResponse({ ok: true, action, path: diskPath, items });
    }

    if (action === "download") {
      const data = await getYandexDownloadInfo(diskPath, token);
      return jsonResponse({ ok: true, action, path: diskPath, href: data.href, method: data.method });
    }

    if (action === "content") {
      const data = await getYandexDownloadInfo(diskPath, token);
      const fileResponse = await fetch(data.href, { method: data.method || "GET" });
      if (!fileResponse.ok) throw new Error(`Yandex.Disk file download HTTP ${fileResponse.status}`);
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", fileResponse.headers.get("Content-Type") || "application/octet-stream");
      const contentLength = fileResponse.headers.get("Content-Length");
      if (contentLength) headers.set("Content-Length", contentLength);
      return new Response(fileResponse.body, { status: 200, headers });
    }

    if (action === "upload") {
      if (!payload.file_base64) return jsonResponse({ error: "file_base64 is empty." }, 400);
      await ensureParentFolders(diskPath, token);
      const data = await getYandexUploadInfo(diskPath, token, Boolean(payload.overwrite));
      const bytes = base64ToBytes(payload.file_base64);
      const uploadResponse = await fetch(data.href, {
        method: data.method || "PUT",
        headers: { "Content-Type": payload.content_type || "application/octet-stream" },
        body: bytes,
      });
      if (!uploadResponse.ok) throw new Error(`Yandex.Disk upload HTTP ${uploadResponse.status}`);
      return jsonResponse({ ok: true, action, path: diskPath, size: bytes.byteLength });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, action, path: diskPath, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
