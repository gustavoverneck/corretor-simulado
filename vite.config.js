import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/corretor-simulado/',
  plugins: [react()],
  // out/ é a saída do electron-forge (npm run make); vigiá-la derruba o dev server no Windows.
  server: { host: '0.0.0.0', port: 4173, watch: { ignored: ['**/out/**'] } },
})
