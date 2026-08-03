const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const distServer = path.join(root, 'dist', 'server');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const appHash = crypto.createHash('sha256').update(appSource).digest('hex').slice(0, 8);
const appAssetPath = `/app-${appHash}.js`;

const sources = [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/index.html', 'index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ['/core.js', 'core.js', 'text/javascript; charset=utf-8'],
  [appAssetPath, 'app.js', 'text/javascript; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ['/sample-promotions.txt', 'sample-promotions.txt', 'text/plain; charset=utf-8'],
  ['/sample-skinoxy-shopee-promotions.txt', 'sample-skinoxy-shopee-promotions.txt', 'text/plain; charset=utf-8'],
  ['/sample-kmb-promotions.txt', 'sample-kmb-promotions.txt', 'text/plain; charset=utf-8'],
  ['/sample-kmb-shopee-promotions.txt', 'sample-kmb-shopee-promotions.txt', 'text/plain; charset=utf-8'],
  ['/sample-dgmr-promotions.txt', 'sample-dgmr-promotions.txt', 'text/plain; charset=utf-8'],
  ['/sample-dgmr-shopee-promotions.txt', 'sample-dgmr-shopee-promotions.txt', 'text/plain; charset=utf-8'],
  ['/data/brands.json', path.join('data', 'brands.json'), 'application/json; charset=utf-8'],
  ['/data/brand-styles.json', path.join('data', 'brand-styles.json'), 'application/json; charset=utf-8'],
  ['/data/skinoxy-products.json', path.join('data', 'skinoxy-products.json'), 'application/json; charset=utf-8'],
  ['/data/kmb-products.json', path.join('data', 'kmb-products.json'), 'application/json; charset=utf-8'],
  ['/data/dgmr-products.json', path.join('data', 'dgmr-products.json'), 'application/json; charset=utf-8']
];

function readSource(file){
  const body = file === 'app.js'
    ? appSource
    : fs.readFileSync(path.join(root, file), 'utf8');

  if (file === 'index.html') {
    return body.replace('src="app.js"', `src="${appAssetPath.slice(1)}"`);
  }

  return body;
}

const assets = Object.fromEntries(sources.map(([urlPath, file, contentType]) => [
  urlPath,
  {
    contentType,
    body: readSource(file)
  }
]));

const worker = `const assets = ${JSON.stringify(assets, null, 2)};

function getAssetPath(request) {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  return pathname === '/' ? '/' : pathname;
}

export default {
  async fetch(request) {
    const asset = assets[getAssetPath(request)];

    if (!asset) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    return new Response(asset.body, {
      headers: {
        'content-type': asset.contentType,
        'cache-control': 'public, max-age=60'
      }
    });
  }
};
`;

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(distServer, { recursive: true });
fs.writeFileSync(path.join(distServer, 'index.js'), worker, 'utf8');

console.log('Built dist/server/index.js');
