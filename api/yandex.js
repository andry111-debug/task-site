// N_166. Explicit Vercel proxy route: /api/yandex.
import { forwardToGipApi } from "./_proxy.js";

export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  return forwardToGipApi(req, res, "/yandex");
}
