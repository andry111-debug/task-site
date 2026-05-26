// N_171. Explicit Vercel proxy route: /api/incoming/upload-chunk.
import { forwardToGipApi } from "../_proxy.js";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  return forwardToGipApi(req, res, "/incoming/upload-chunk");
}
