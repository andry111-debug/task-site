import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";


dotenv.config();

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || "0.0.0.0";
const GIP_API_KEY = String(process.env.GIP_API_KEY || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const YANDEX_ACCESS_TOKEN = String(process.env.YANDEX_ACCESS_TOKEN || "").trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const INCOMING_CHUNK_ROOT = process.env.INCOMING_CHUNK_ROOT || path.join(os.tmpdir(), "gip-api-incoming-chunks");
const ALLOWED_TABLES = new Set(
  String(process.env.ALLOWED_TABLES || "employees,ppt_schedule,opr_site_sections,opr_site_section_files,opr_site_incoming_files,opr_site_action_history")
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
);

// Required by site version N_207+. Keep this table available even if an older
// ALLOWED_TABLES value is set in .env on the Windows server.
ALLOWED_TABLES.add("opr_site_action_history");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE key is not configured. Database endpoints will fail until .env is filled.");
}

if (!YANDEX_ACCESS_TOKEN) {
  console.warn("WARNING: YANDEX_ACCESS_TOKEN is not configured. Yandex endpoints will fail until .env is filled.");
}

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

const app = express();

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json({ limit: "220mb" }));

function requireApiKey(req, res, next) {
  if (!GIP_API_KEY) return next();
  const received = String(req.header("x-gip-api-key") || "").trim();
  if (received !== GIP_API_KEY) {
    return res.status(401).json({ error: { message: "Unauthorized GIP API request." } });
  }
  return next();
}

app.use("/api", requireApiKey);

function normalizePathSeparators(value) {
  return String(value || "").trim().replace(/\\+/g, "/").replace(/\/+/g, "/");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function dirname(path) {
  const normalized = normalizePathSeparators(path);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

function parentDirs(path) {
  const dir = trimSlashes(dirname(path));
  if (!dir) return [];
  const parts = dir.split("/").filter(Boolean);
  const result = [];
  for (let i = 1; i <= parts.length; i += 1) {
    result.push(`/${parts.slice(0, i).join("/")}`);
  }
  return result;
}

function toYandexDiskPath(rawPath) {
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

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return data;
}

async function yandexGet(path) {
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/${path}`, {
    method: "GET",
    headers: {
      Authorization: `OAuth ${YANDEX_ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    const message = String(data.message || data.description || data.error || `Yandex.Disk HTTP ${response.status}`);
    throw new Error(message);
  }
  return data;
}

async function yandexPutResource(diskPath) {
  const params = new URLSearchParams({ path: diskPath });
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?${params.toString()}`, {
    method: "PUT",
    headers: {
      Authorization: `OAuth ${YANDEX_ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (response.status === 409) return;
  const data = await parseResponse(response);
  if (!response.ok) {
    const message = String(data.message || data.description || data.error || `Yandex.Disk HTTP ${response.status}`);
    throw new Error(message);
  }
}

async function ensureParentFolders(diskPath) {
  for (const dir of parentDirs(diskPath)) {
    await yandexPutResource(dir);
  }
}

async function getYandexDownloadInfo(diskPath) {
  const params = new URLSearchParams({ path: diskPath });
  const data = await yandexGet(`resources/download?${params.toString()}`);
  const href = String(data.href || "");
  if (!href) throw new Error("Yandex.Disk did not return a download URL.");
  return { href, method: String(data.method || "GET") };
}

async function getYandexUploadInfo(diskPath, overwrite = false) {
  const params = new URLSearchParams({ path: diskPath, overwrite: overwrite ? "true" : "false" });
  const data = await yandexGet(`resources/upload?${params.toString()}`);
  const href = String(data.href || "");
  if (!href) throw new Error("Yandex.Disk did not return an upload URL.");
  return { href, method: String(data.method || "PUT") };
}

function sanitizeUploadId(value) {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned.length > 80) throw new Error("Invalid upload_id.");
  return cleaned;
}

function getChunkDir(uploadId) {
  return path.join(INCOMING_CHUNK_ROOT, sanitizeUploadId(uploadId));
}

async function ensureLocalDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function removeLocalDir(dirPath) {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {}
}

function parseChunkIndex(value, fieldName) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) throw new Error(`${fieldName} is invalid.`);
  return index;
}

function parseTotalChunks(value) {
  const total = Number(value);
  if (!Number.isInteger(total) || total < 1 || total > 10000) throw new Error("total_chunks is invalid.");
  return total;
}

async function uploadBufferToYandex(diskPath, bytes, contentType, overwrite = false) {
  await ensureParentFolders(diskPath);
  const data = await getYandexUploadInfo(diskPath, overwrite);
  const uploadResponse = await fetch(data.href, {
    method: data.method || "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: bytes,
  });
  if (!uploadResponse.ok) throw new Error(`Yandex.Disk upload HTTP ${uploadResponse.status}`);
}

function normalizeSupabaseError(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    code: error.code,
    details: error.details,
    hint: error.hint,
  };
}

function parseListValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [value];
}

function applyFilters(query, filters = []) {
  let next = query;
  for (const filter of filters || []) {
    const operator = String(filter?.operator || "eq").toLowerCase();
    const column = String(filter?.column || "").trim();
    if (!column) continue;

    if (operator === "eq") next = next.eq(column, filter.value);
    else if (operator === "neq" || operator === "ne") next = next.neq(column, filter.value);
    else if (operator === "gt") next = next.gt(column, filter.value);
    else if (operator === "gte") next = next.gte(column, filter.value);
    else if (operator === "lt") next = next.lt(column, filter.value);
    else if (operator === "lte") next = next.lte(column, filter.value);
    else if (operator === "like") next = next.like(column, String(filter.value ?? ""));
    else if (operator === "ilike") next = next.ilike(column, String(filter.value ?? ""));
    else if (operator === "is") next = next.is(column, filter.value);
    else if (operator === "in") next = next.in(column, parseListValue(filter.value));
    else if (operator === "contains" || operator === "cs") next = next.contains(column, filter.value);
    else throw new Error(`Unsupported filter operator: ${operator}`);
  }
  return next;
}

function applyOrders(query, orders = []) {
  let next = query;
  for (const order of orders || []) {
    const column = String(order?.column || "").trim();
    if (!column) continue;
    const options = { ascending: order?.ascending !== false };
    if (order?.nullsFirst === true) options.nullsFirst = true;
    if (order?.foreignTable) options.foreignTable = String(order.foreignTable);
    next = next.order(column, options);
  }
  return next;
}

function applyRangeAndLimit(query, body = {}) {
  let next = query;

  const range = body?.range;
  if (range && typeof range === "object") {
    const from = Number(range.from ?? range.start ?? range.offset ?? 0);
    const to = Number(range.to ?? range.end ?? range.limitTo ?? -1);
    if (Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from) {
      return next.range(from, to);
    }
  }

  const from = body?.from ?? body?.offset;
  const to = body?.to;
  if (from !== undefined && to !== undefined) {
    const fromNum = Number(from);
    const toNum = Number(to);
    if (Number.isInteger(fromNum) && Number.isInteger(toNum) && fromNum >= 0 && toNum >= fromNum) {
      return next.range(fromNum, toNum);
    }
  }

  const limit = body?.limit;
  if (limit !== undefined && limit !== null && limit !== "") {
    const limitNum = Number(limit);
    if (Number.isInteger(limitNum) && limitNum > 0) {
      const safeLimit = Math.min(limitNum, 10000);
      next = next.limit(safeLimit);
    }
  }

  return next;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "gip-api-proxy",
    version: "N_227",
    supabaseConfigured: Boolean(supabase),
    yandexConfigured: Boolean(YANDEX_ACCESS_TOKEN),
  });
});

app.post("/api/supabase/query", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: { message: "Supabase is not configured in GIP API .env." } });
  }

  try {
    const table = String(req.body?.table || "").trim();
    const action = String(req.body?.action || "select").trim();
    const select = String(req.body?.select || "*");
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : [];
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const payload = req.body?.payload ?? req.body?.values ?? req.body?.value;
    const options = req.body?.options || {};
    const single = req.body?.single || null;
    const head = Boolean(req.body?.head || options?.head);
    const count = req.body?.count || options?.count || null;

    if (!table) return res.status(400).json({ error: { message: "Table name is empty." } });
    if (!ALLOWED_TABLES.has(table)) return res.status(403).json({ error: { message: `Table is not allowed: ${table}` } });

    let query;
    if (action === "select") {
      const selectOptions = {};
      if (count) selectOptions.count = String(count);
      if (head) selectOptions.head = true;
      query = supabase.from(table).select(select, selectOptions);
    } else if (action === "insert") {
      query = supabase.from(table).insert(payload);
    } else if (action === "update") {
      query = supabase.from(table).update(payload);
    } else if (action === "delete") {
      query = supabase.from(table).delete();
    } else if (action === "upsert") {
      query = supabase.from(table).upsert(payload, options);
    } else {
      return res.status(400).json({ error: { message: `Unsupported Supabase action: ${action}` } });
    }

    query = applyFilters(query, filters);
    query = applyOrders(query, orders);
    if (action === "select") {
      query = applyRangeAndLimit(query, req.body || {});
    }

    const result = single === "maybe" ? await query.maybeSingle() : await query;
    if (result.error) {
      const status = result.status && Number(result.status) >= 400 ? Number(result.status) : 400;
      return res.status(status).json({ data: result.data ?? null, error: normalizeSupabaseError(result.error) });
    }

    return res.json({ data: result.data ?? null, error: null, count: result.count ?? null, status: result.status ?? null });
  } catch (error) {
    return res.status(500).json({ error: { message: error instanceof Error ? error.message : String(error) } });
  }
});


app.post("/api/incoming/upload-chunk", async (req, res) => {
  try {
    const uploadId = sanitizeUploadId(req.body?.upload_id);
    const chunkIndex = parseChunkIndex(req.body?.chunk_index, "chunk_index");
    const totalChunks = parseTotalChunks(req.body?.total_chunks);
    if (chunkIndex >= totalChunks) return res.status(400).json({ error: "chunk_index is outside total_chunks." });
    const chunkBase64 = String(req.body?.chunk_base64 || "");
    if (!chunkBase64) return res.status(400).json({ error: "chunk_base64 is empty." });

    const dirPath = getChunkDir(uploadId);
    await ensureLocalDir(dirPath);
    await fs.promises.writeFile(path.join(dirPath, `${String(chunkIndex).padStart(6, "0")}.part`), Buffer.from(chunkBase64, "base64"));
    await fs.promises.writeFile(path.join(dirPath, "meta.json"), JSON.stringify({ uploadId, totalChunks, updatedAt: new Date().toISOString() }, null, 2), "utf-8");

    return res.json({ ok: true, upload_id: uploadId, chunk_index: chunkIndex, total_chunks: totalChunks });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/incoming/finish-upload", async (req, res) => {
  let dirPath = "";
  try {
    if (!supabase) return res.status(500).json({ error: { message: "Supabase is not configured in GIP API .env." } });
    if (!YANDEX_ACCESS_TOKEN) return res.status(500).json({ error: "YANDEX_ACCESS_TOKEN is not configured in GIP API .env." });

    const uploadId = sanitizeUploadId(req.body?.upload_id);
    const totalChunks = parseTotalChunks(req.body?.total_chunks);
    const diskPath = toYandexDiskPath(String(req.body?.disk_path || ""));
    const contentType = String(req.body?.content_type || "application/octet-stream");
    const incomingTable = String(req.body?.incoming_table || "opr_site_incoming_files").trim();
    const incomingPayload = req.body?.incoming_payload || null;
    if (!diskPath) return res.status(400).json({ error: "disk_path is empty." });
    if (!incomingPayload || typeof incomingPayload !== "object") return res.status(400).json({ error: "incoming_payload is empty." });
    if (!ALLOWED_TABLES.has(incomingTable)) return res.status(403).json({ error: `Table is not allowed: ${incomingTable}` });

    dirPath = getChunkDir(uploadId);
    const buffers = [];
    for (let index = 0; index < totalChunks; index += 1) {
      const chunkPath = path.join(dirPath, `${String(index).padStart(6, "0")}.part`);
      if (!fs.existsSync(chunkPath)) return res.status(400).json({ error: `Missing chunk ${index + 1} of ${totalChunks}.` });
      buffers.push(await fs.promises.readFile(chunkPath));
    }
    const bytes = Buffer.concat(buffers);

    const expectedSize = Number(req.body?.file_size || incomingPayload.file_size || 0);
    if (expectedSize && bytes.byteLength !== expectedSize) {
      return res.status(400).json({ error: `File size mismatch: received ${bytes.byteLength}, expected ${expectedSize}.` });
    }

    const expectedSha256 = String(req.body?.sha256 || incomingPayload.sha256 || "").trim().toLowerCase();
    if (expectedSha256) {
      const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== expectedSha256) {
        return res.status(400).json({ error: "File checksum mismatch after chunk upload." });
      }
    }

    await uploadBufferToYandex(diskPath, bytes, contentType, Boolean(req.body?.overwrite));

    const { data, error, status } = await supabase.from(incomingTable).insert(incomingPayload).select("id").maybeSingle();
    if (error) {
      const httpStatus = status && Number(status) >= 400 ? Number(status) : 400;
      return res.status(httpStatus).json({ data: data ?? null, error: normalizeSupabaseError(error) });
    }

    await removeLocalDir(dirPath);
    return res.json({ ok: true, upload_id: uploadId, path: diskPath, size: bytes.byteLength, data: data ?? null, error: null });
  } catch (error) {
    if (dirPath) await removeLocalDir(dirPath);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.post("/api/yandex", async (req, res) => {
  if (!YANDEX_ACCESS_TOKEN) {
    return res.status(500).json({ error: "YANDEX_ACCESS_TOKEN is not configured in GIP API .env." });
  }

  const action = String(req.body?.action || "list").trim();
  const diskPath = toYandexDiskPath(String(req.body?.path || ""));
  if (!diskPath) return res.status(400).json({ error: "Path is empty." });

  try {
    if (action === "list") {
      const limit = Math.max(1, Math.min(Number(req.body?.limit || 200), 500));
      const params = new URLSearchParams({
        path: diskPath,
        limit: String(limit),
        fields: "path,name,type,mime_type,modified,created,size,_embedded.items.path,_embedded.items.name,_embedded.items.type,_embedded.items.mime_type,_embedded.items.modified,_embedded.items.created,_embedded.items.size",
      });
      const data = await yandexGet(`resources?${params.toString()}`);
      const items = Array.isArray(data?._embedded?.items) ? data._embedded.items : [];
      return res.json({ ok: true, action, path: diskPath, items });
    }

    if (action === "download") {
      const data = await getYandexDownloadInfo(diskPath);
      return res.json({ ok: true, action, path: diskPath, href: data.href, method: data.method });
    }

    if (action === "content") {
      const data = await getYandexDownloadInfo(diskPath);
      const fileResponse = await fetch(data.href, { method: data.method || "GET" });
      if (!fileResponse.ok) throw new Error(`Yandex.Disk file download HTTP ${fileResponse.status}`);

      res.status(200);
      res.setHeader("Content-Type", fileResponse.headers.get("Content-Type") || "application/octet-stream");
      const contentLength = fileResponse.headers.get("Content-Length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      const arrayBuffer = await fileResponse.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    if (action === "upload") {
      if (!req.body?.file_base64) return res.status(400).json({ error: "file_base64 is empty." });
      await ensureParentFolders(diskPath);
      const data = await getYandexUploadInfo(diskPath, Boolean(req.body?.overwrite));
      const bytes = Buffer.from(String(req.body.file_base64 || ""), "base64");
      const uploadResponse = await fetch(data.href, {
        method: data.method || "PUT",
        headers: { "Content-Type": req.body?.content_type || "application/octet-stream" },
        body: bytes,
      });
      if (!uploadResponse.ok) throw new Error(`Yandex.Disk upload HTTP ${uploadResponse.status}`);
      return res.json({ ok: true, action, path: diskPath, size: bytes.byteLength });
    }

    return res.status(400).json({ error: `Unsupported action: ${action}` });
  } catch (error) {
    return res.status(500).json({ ok: false, action, path: diskPath, error: error instanceof Error ? error.message : String(error) });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: { message: "GIP API route not found." } });
});

app.listen(PORT, HOST, () => {
  console.log(`GIP API N_227 started on http://${HOST}:${PORT}/api/health`);
});
