import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // listen on all addresses so you can open the app from other devices on the network
    host: true,
    // optional: default Vite port is 5173; feel free to change
    port: 5173,
  },
})
