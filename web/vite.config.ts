import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { assistent } from './assistent/tillegg.ts'

// https://vite.dev/config/
export default defineConfig({
  // «Spør»-assistenten kjører bare i utviklingsserveren.
  plugins: [react(), assistent()],
  // Relative stier, så den bygde siden virker uansett hvor den legges.
  base: './',
  // Fast port, så treningsdagboka ikke kolliderer med andre lokale apper på 5173.
  server: { port: 5180, strictPort: true },
})
