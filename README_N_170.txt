N_170 project site update

Changes:
- Incoming file upload no longer sends the full file through one Vercel Function request.
- Files are uploaded to GIP API in chunks, so files larger than the Vercel function payload limit can be accepted.
- Requires GIP API N_169 or newer on the Windows Server.
- Keep Vercel Environment Variables:
  VITE_GIP_API_BASE_URL=/api
  GIP_API_UPSTREAM=http://SERVER_IP:3100/api
