import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative stier, så den bygde siden virker uansett hvor den legges.
  base: './',
  // Fast port, så treningsdagboka ikke kolliderer med andre lokale apper på 5173.
  server: { port: 5180, strictPort: true },
})
