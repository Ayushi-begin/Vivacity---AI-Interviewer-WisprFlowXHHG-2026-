import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the repo-root .env, which is shared with the backend.
  // Only VITE_-prefixed values are exposed to the browser. Secrets stay server-side.
  envDir: '..',
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than app code, so they get their own long-lived chunk.
        manualChunks(id) {
          if (/node_modules[\/](react|react-dom|react-router|scheduler|axios)[\/]/.test(id)) return 'vendor'
        },
      },
    },
  },
})
