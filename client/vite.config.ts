import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Lists every built file so the service worker can precache the whole app for offline use. */
function assetManifest(): Plugin {
  return {
    name: 'asset-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).map((f) => `/${f}`);
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({ version: Date.now(), files }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
