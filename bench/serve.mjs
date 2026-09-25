// a tiny static server for the repo root, so the bench pages can load the engine and the examples' tiles
// node bench/serve.mjs [port] serves the repo at http://localhost:8765/; the runners import serve() from here and let
// the system pick a free port, so they run beside a server already up
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.json': 'application/json' };
export function serve(port = 0)
{
    const server = createServer(async (req, res) =>
    {
        // an encoded slash decodes after the URL resolved its dots, so check the path stays in the repo
        const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
        if (!path.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
        try
        {
            const data = await readFile(path);
            res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
            res.end(data);
        }
        catch { res.writeHead(404); res.end(); }
    });
    server.listen(port, 'localhost'); // this machine only
    return new Promise(resolve => server.once('listening', ()=> resolve(server)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
{
    const port = +process.argv[2] || 8765;
    await serve(port);
    console.log(`serving ${root} at http://localhost:${port}/bench/all.html`);
}
