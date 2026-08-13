import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves project sites under /<repo-name>/ — CI sets VITE_BASE
  // to "/Visualization-project/". Local dev and Vercel use the default "/".
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
