// N_342. Explicit Vercel proxy route for finished local archive downloads.
// Browser opens /api/archive-download/<jobId>/<fileName> on Vercel.
// This function forwards it to GIP_API_UPSTREAM + /archive-download/<jobId>/<fileName>.
import { forwardToGipApi } from "../_proxy.js";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

function getForwardPath(req) {
  const url = new URL(req.url || "/", "http://localhost");
  let rest = url.pathname || "/";
  rest = rest.replace(/^\/api\/archive-download\/?/, "");
  rest = rest.replace(/^\/+/, "");
  return rest ? `/archive-download/${rest}` : "/archive-download";
}

export default async function handler(req, res) {
  return forwardToGipApi(req, res, getForwardPath(req));
}
