// N_166. Fallback Vercel proxy route for /api/*.
import { forwardToGipApi } from "./_proxy.js";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

function getForwardPath(req) {
  const url = new URL(req.url || "/", "http://localhost");
  let path = url.pathname || "/";
  path = path.replace(/^\/api\/?/, "");
  if (!path) return "/";
  return `/${path}`;
}

export default async function handler(req, res) {
  return forwardToGipApi(req, res, getForwardPath(req));
}
