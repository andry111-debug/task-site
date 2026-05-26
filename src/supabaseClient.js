// N_160. Browser client does not connect to Supabase directly.
// All database requests go through GIP API: VITE_GIP_API_BASE_URL.

const rawApiBaseUrl = import.meta.env.VITE_GIP_API_BASE_URL || "/api";
const apiKey = import.meta.env.VITE_GIP_API_KEY || "";

function normalizeApiBaseUrl(value) {
  return String(value || "/api").trim().replace(/\/+$/g, "") || "/api";
}

const apiBaseUrl = normalizeApiBaseUrl(rawApiBaseUrl);

export const isSupabaseReady = Boolean(apiBaseUrl);

function makeHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-gip-api-key"] = apiKey;
  return headers;
}

function normalizeProxyError(error) {
  if (!error) return null;
  if (typeof error === "string") return { message: error };
  if (error.message) return error;
  return { message: JSON.stringify(error) };
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: { message: text || `HTTP ${response.status}` } };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
    return { data: null, error: { message: String(message) } };
  }

  return {
    data: data?.data ?? null,
    error: normalizeProxyError(data?.error),
  };
}

class ProxyQueryBuilder {
  constructor(table) {
    this.table = table;
    this.action = "select";
    this.columns = "*";
    this.filters = [];
    this.orders = [];
    this.payload = null;
    this.options = {};
    this.singleMode = null;
  }

  select(columns = "*") {
    this.action = "select";
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push({ operator: "eq", column, value });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this.execute();
  }

  insert(payload) {
    this.action = "insert";
    this.payload = payload;
    return this.execute();
  }

  update(payload) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  upsert(payload, options = {}) {
    this.action = "upsert";
    this.payload = payload;
    this.options = options || {};
    return this.execute();
  }

  async execute() {
    return postJson("/supabase/query", {
      table: this.table,
      action: this.action,
      select: this.columns,
      filters: this.filters,
      orders: this.orders,
      payload: this.payload,
      options: this.options,
      single: this.singleMode,
    });
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }
}

export const supabase = {
  from(table) {
    return new ProxyQueryBuilder(table);
  },
};
