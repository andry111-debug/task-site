N_167 project site for Vercel deployment

This package fixes the N_166 deployment package issue: node_modules and dist are excluded from the archive.

Use with Vercel environment variables:
VITE_GIP_API_BASE_URL=/api
GIP_API_UPSTREAM=http://YOUR_WINDOWS_SERVER_IP:3100/api

Deploy this archive to Vercel. Do not include node_modules in Git.
