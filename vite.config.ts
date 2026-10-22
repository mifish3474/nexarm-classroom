import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  root: 'app',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, rolldownOptions: { input: ['app/index.html', 'app/commissioning.html', 'app/mapping.html'] } },
  plugins: [{
    name: 'app-version',
    transformIndexHtml(html) {
      // Read for each response: an already-running dev server must not retain
      // the version captured before package.json was updated.
      const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
      return html.replaceAll('%APP_VERSION%', version);
    },
  }, {
    name: 'production-privacy-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
    },
  }],
});
