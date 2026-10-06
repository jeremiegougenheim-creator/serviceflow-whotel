// Local dev gateway: one origin (54321) that routes like Supabase's API gateway, with CORS.
const http = require('http');
const routes = [['/auth/v1', 9999], ['/rest/v1', 3001]];
const cors = (res, req) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info, prefer, range, x-supabase-api-version, accept-profile, content-profile');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-supabase-api-version');
};
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res, req); res.writeHead(204); return res.end(); }
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404); return res.end('not routed: ' + req.url); }
  const path = req.url.slice(r[0].length) || '/';
  const headers = { ...req.headers, host: '127.0.0.1:' + r[1] };
  const p = http.request({ host: '127.0.0.1', port: r[1], path, method: req.method, headers }, (up) => {
    const h = { ...up.headers };
    delete h['access-control-allow-origin'];
    cors(res, req);
    res.writeHead(up.statusCode, h); up.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(54321, '127.0.0.1', () => console.log('gateway on 54321'));
