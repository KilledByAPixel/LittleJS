// browser smoke tests: real WebGL in headless Chrome with the software renderer, no window and no dependencies
// npm run test:browser [name...]   run every check, or only the pages and shorts whose names are given
// Chrome is found in the usual places or from CHROME_PATH and driven over its DevTools socket with Node's WebSocket
// (Node 22); without either the run is skipped, or fails when CI is set
// each page runs its checks, reads real pixels, and writes {checks: [{name, ok, detail}]} into <pre id=result>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pages = ['draw2d', 'shaders', 'draw3d', 'contextLoss'];
const pageTimeout = 60e3, atOnce = 4;

function findChrome()
{
    const env = process.env, places = [env.CHROME_PATH,
        env.PROGRAMFILES && join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
        env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
        env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    return places.find((place)=> place && existsSync(place));
}

// the repository over http, so images and fetches work as they do on a site
function serve()
{
    const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.css': 'text/css',
        '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'};
    const server = createServer((request, response)=>
    {
        const file = normalize(join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname)));
        if (!file.startsWith(root) || !existsSync(file))
            return response.writeHead(404).end();
        try
        {
            const data = readFileSync(file);
            response.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}).end(data);
        }
        catch { response.writeHead(404).end(); } // a folder
    });
    return new Promise((resolve)=> server.listen(0, '127.0.0.1', ()=> resolve(server)));
}

// one Chrome for the whole run, driven over its DevTools socket with Node's own WebSocket
function startChrome(chrome)
{
    const profile = mkdtempSync(join(tmpdir(), 'littlejs-smoke-'));
    const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--mute-audio', '--no-first-run', '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1000,700',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {windowsHide: true});
    const stop = ()=>
    {
        child.kill();
        try { rmSync(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); } catch {}
    };
    return new Promise((resolve, reject)=>
    {
        let text = '';
        const timer = setTimeout(()=> { stop(); reject(new Error('Chrome did not start')); }, 30e3);
        child.on('error', reject);
        child.stderr.on('data', (data)=>
        {
            // it says where it listens once it is up
            const address = (text += data).match(/DevTools listening on (ws:\S+)/)?.[1];
            if (!address) return;
            clearTimeout(timer);
            const socket = new WebSocket(address), waiting = new Map;
            let nextId = 0;
            socket.onmessage = (event)=>
            {
                const message = JSON.parse(event.data), wait = waiting.get(message.id);
                if (!wait) return;
                waiting.delete(message.id);
                message.error ? wait.reject(new Error(message.error.message)) : wait.resolve(message.result);
            };
            const send = (method, params={}, sessionId)=> new Promise((resolve, reject)=>
            {
                waiting.set(++nextId, {resolve, reject});
                socket.send(JSON.stringify({id: nextId, method, params, sessionId}));
            });
            socket.onopen = ()=> resolve({send, stop: ()=> { socket.close(); stop(); }});
            socket.onerror = ()=> { stop(); reject(new Error('no DevTools socket')); };
        });
    });
}

// run one page in a tab of its own and hand back its checks, a failed check when it gave none in time
async function runPage(browser, url, name)
{
    let checks, text;
    try
    {
        const {targetId} = await browser.send('Target.createTarget', {url});
        const {sessionId} = await browser.send('Target.attachToTarget', {targetId, flatten: true});
        for (const end = Date.now() + pageTimeout; Date.now() < end;)
        {
            await new Promise((resolve)=> setTimeout(resolve, 100));
            const read = await browser.send('Runtime.evaluate',
                {expression: "document.getElementById('result')?.textContent", returnByValue: true}, sessionId);
            text = read.result?.value;
            if (text && text != 'PENDING') break;
        }
        await browser.send('Target.closeTarget', {targetId});
        checks = JSON.parse(text).checks;
    }
    catch (error) { text = String(text) + ' ' + error.message; }
    if (!Array.isArray(checks) || !checks.length)
        checks = [{name: 'page ran', ok: false, detail: 'no result: ' + String(text).slice(0, 200)}];
    return {name, checks};
}

// the shorts, by the file names examples/shorts.js lists
function shortNames()
{
    const list = readFileSync(join(root, 'examples/shorts.js'), 'utf8');
    return [...list.matchAll(/new ExampleInfo\('[^']*', '([\w-]+)\.js'/g)].map((match)=> match[1])
        .filter((name)=> existsSync(join(root, 'examples/shorts', name + '.js')));
}

// without what it needs the run is skipped, or fails where CI is set
const chrome = findChrome();
const missing = !chrome ? 'no Chrome found, set CHROME_PATH' :
    typeof WebSocket == 'undefined' ? 'this Node has no WebSocket, use Node 22 or later' : '';
if (missing)
{
    console.log('browser smoke tests: ' + missing + (process.env.CI ? '' : '; skipped'));
    process.exit(process.env.CI ? 1 : 0);
}
const browser = await startChrome(chrome);
const server = await serve(), base = 'http://127.0.0.1:' + server.address().port + '/test/browser/';
const only = process.argv.slice(2);
const jobs = [...pages.map((name)=> [name, base + name + '.html']),
    ...shortNames().map((name)=> ['short ' + name, base + 'short.html?short=' + name])]
    .filter(([name])=> !only.length || only.some((word)=> name.split(' ').includes(word)));

let failed = 0, passed = 0, next = 0;
const results = [];
await Promise.all(Array.from({length: atOnce}, async ()=>
{
    while (next < jobs.length)
    {
        const index = next++, [name, url] = jobs[index];
        results[index] = await runPage(browser, url, name);
    }
}));
browser.stop();
server.close();
for (const {name, checks} of results)
    for (const check of checks)
    {
        check.ok ? ++passed : ++failed;
        if (!check.ok || !name.startsWith('short '))
            console.log((check.ok ? 'ok   ' : 'FAIL ') + name + ': ' + check.name +
                (check.detail !== undefined ? ' ' + JSON.stringify(check.detail) : ''));
    }
console.log(`browser smoke tests: ${passed} passed, ${failed} failed, ${jobs.length} pages`);
process.exit(failed || !jobs.length ? 1 : 0);
