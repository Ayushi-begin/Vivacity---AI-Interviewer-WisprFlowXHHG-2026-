import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the repo-root .env, which is shared with the backend.
  // Only VITE_-prefixed values are exposed to the browser. Secrets stay server-side.
  envDir: '..',
  server: { port: 5173, strictPort: true },
})
