// N_343. Explicit Vercel API route for finished local archive downloads.
// Browser opens /api/archive-download?jobId=...&fileName=...
// This function forwards it to GIP_API_UPSTREAM + /archive-download/<jobId>/<fileName>.

import { forwardToGipApi } from "./_proxy.js";

function safeText(value) {
  return String(value || "").trim();
}

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const jobId = safeText(url.searchParams.get("jobId"));
  const fileName = safeText(url.searchParams.get("fileName")) || "archive.zip";

  if (!jobId) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "jobId is required" }));
    return;
  }

  const targetPath = `/archive-download/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`;
  return forwardToGipApi(req, res, targetPath);
}
