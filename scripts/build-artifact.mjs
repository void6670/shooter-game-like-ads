// Bundles the Vite build into one self-contained HTML file (no doctype/head/body —
// the Artifact host wraps it) at artifact/bridge-squad.html.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const dir = 'dist/assets';
const files = readdirSync(dir);
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8');
let css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');
// inline font files referenced by url(./...) as data URIs
css = css.replace(/url\(\.\/([^)]+?\.woff2)\)format\("woff2"\)(,url\(\.\/[^)]+?\.woff\)format\("woff"\))?/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(`${dir}/${f}`).toString('base64')})format("woff2")`);
if (/url\(\.\//.test(css)) throw new Error('unresolved asset url in CSS');
if (js.includes('</script')) throw new Error('bundle contains </script');

const html = readFileSync('dist/index.html', 'utf8');
const body = html.slice(html.indexOf('<div id="app">'), html.lastIndexOf('</body>'));

const out = `<title>Bridge Squad</title>
<meta name="theme-color" content="#1e88ff" />
<style>
:root { color-scheme: dark; }
html, body { height: 100%; }
${css}
#app { height: 100%; }
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/bridge-squad.html', out);
console.log('artifact/bridge-squad.html', (out.length / 1024).toFixed(0) + ' KB');
