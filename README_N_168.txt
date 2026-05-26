N_168 project site update

Changes:
1. Upload validation errors for the GIP review upload form are displayed inside the upload block.
2. Successful upload notice is displayed inside the upload block.
3. Labels in the upload block are more contrast and readable.
4. Vercel API proxy routes from N_167 are preserved.

Deploy to Vercel. Keep environment variables:
VITE_GIP_API_BASE_URL=/api
GIP_API_UPSTREAM=http://SERVER_IP:3100/api
