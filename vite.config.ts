import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, rolldownOptions: { input: ['app/index.html', 'app/commissioning.html', 'app/mapping.html'] } },
  plugins: [{
    name: 'production-privacy-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
    },
  }],
});
