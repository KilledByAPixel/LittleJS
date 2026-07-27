#!/usr/bin/env node

/**
 * LittleJS Dev Server
 * - Minimal static file server with no dependencies
 * - Needed because opening index.html over file:// makes tiles.png
 *   cross-origin, which makes WebGL texture upload throw a SecurityError
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const MIME =
{
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
};

http.createServer((req, res) =>
{
    let urlPath, filePath;
    try
    {
        // strip query string and decode, then resolve inside ROOT
        urlPath = decodeURIComponent(req.url.split('?')[0]);
        filePath = path.join(ROOT, urlPath);
    }
    catch (e)
    {
        // malformed percent-encoding in the url
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    // prevent escaping the root directory
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep))
    {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // serve index.html for directories
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())
        filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (err, data) =>
    {
        if (err)
        {
            res.writeHead(404);
            res.end('Not found: ' + urlPath);
            return;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-cache'});
        res.end(data);
    });
}).listen(PORT, '127.0.0.1', () =>
{
    console.log(`LittleJS dev server running at http://localhost:${PORT}`);
    console.log(`Starter project: http://localhost:${PORT}/examples/starter/`);
});
