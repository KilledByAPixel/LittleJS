#!/usr/bin/env node

/**
 * LittleJS Release Page Walk - run with: npm run test:release
 * - Loads the BUILT release page in a headless browser and drives it
 * - Catches the class of bug that neither the dev page nor `npm test` can see,
 *   because both of those run the readable sources instead of the zip:
 *     - Closure renaming a DOM property it has no extern for
 *     - a disabled feature in FEATURES stripping more than it should
 *     - an html shell that parses but never executes the script
 * - Fails on any page error, and on a page that loads but stops animating
 * - Exits 0 with a notice if no Chrome or Edge is installed, so it can sit in
 *   a test script without breaking machines that have no browser
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_FOLDER = join(__dirname, '..', 'examples', 'starter', 'build');
const PAGE = 'index.html';

// The page runs in real time and reports back over http as it goes.
// - do NOT be tempted to add --virtual-time-budget to speed this up. Under
//   virtual time the browser only draws a handful of frames and freezes the
//   timestamp it hands the callback, so there is no way left to tell a
//   healthy loop from one that stopped. In real time it holds a steady 60.
const WALK_END = 3200;          // ms of page time to stop the walk at
const REPORT_INTERVAL = 100;    // ms between reports from the page
const BROWSER_TIMEOUT = 60000;  // give up on the browser after this
// The engine must still have been drawing this late, which is what catches a
// game that starts fine and then throws once it reaches some state.
const MIN_LAST_FRAME = WALK_END - 750;
// Only a sanity floor separating "drew something" from "never ran", which
// reports 0. The frame count swings with machine load, the check above does
// not, so keep this loose and let that one do the work.
const MIN_FRAMES = 20;

// The walk itself, in milliseconds since the page started. Each step runs
// once and anything it throws is reported as a failure. Add your own as the
// game grows: press the key that starts a run, wait, press the one that opens
// the pause menu, and so on. The point is to reach every screen, because a
// release only bug hides in the branch nothing ever executed.
const WALK_STEPS =
[
    {
        at: 300, name: 'canvas is sized',
        run: `const c = document.querySelector('canvas');
              if (!c) throw 'no canvas element';
              if (!c.width || !c.height) throw 'canvas is ' + c.width + 'x' + c.height;`
    },
    { at:  600, name: 'keydown',   run: `dispatchEvent(new KeyboardEvent('keydown', {code:'ArrowRight'}))` },
    { at:  900, name: 'keyup',     run: `dispatchEvent(new KeyboardEvent('keyup', {code:'ArrowRight'}))` },
    { at: 1200, name: 'mousemove', run: `dispatchEvent(new MouseEvent('mousemove', {clientX:200, clientY:150}))` },
    { at: 1500, name: 'mousedown', run: `dispatchEvent(new MouseEvent('mousedown', {clientX:200, clientY:150, button:0}))` },
    { at: 1800, name: 'mouseup',   run: `dispatchEvent(new MouseEvent('mouseup', {clientX:200, clientY:150, button:0}))` },
    { at: 2100, name: 'wheel',     run: `dispatchEvent(new WheelEvent('wheel', {deltaY:1}))` },
    { at: 2400, name: 'resize',    run: `dispatchEvent(new Event('resize'))` },
    { at: 2700, name: 'blur',      run: `dispatchEvent(new Event('blur'))` },
];

// Injected ahead of the game so it sees every error and every frame
const PRELUDE = `<script>
(()=>{
    const result = { frames: 0, lastFrame: 0, errors: [], steps: [], done: false };
    const steps = __STEPS__;
    let stepIndex = 0;

    const post = ()=>
    {
        try { fetch('__REPORT__', {method: 'POST', body: JSON.stringify(result)}); }
        catch (e) {} // a failed report must never become a page error itself
    };
    const fail = (what, e)=> result.errors.push(what + ': ' + (e && e.stack || e));

    addEventListener('error', e=> fail('uncaught', e.error || e.message));
    addEventListener('unhandledrejection', e=> fail('unhandled rejection', e.reason));
    const consoleError = console.error;
    console.error = (...a)=>
    {
        fail('console.error', a.join(' '));
        consoleError.apply(console, a);
    };

    const raf = requestAnimationFrame;
    window.requestAnimationFrame = cb=> raf(time=>
    {
        ++result.frames;
        result.lastFrame = Math.round(performance.now());
        cb(time);
    });

    const handle = setInterval(()=>
    {
        const now = performance.now();
        const step = steps[stepIndex];
        if (step && now >= step.at)
        {
            ++stepIndex;
            try { (new Function(step.run))(); result.steps.push(step.name); }
            catch (e) { fail('step "' + step.name + '"', e); }
        }
        if (now >= __WALK_END__)
        {
            result.done = true;
            clearInterval(handle);
        }
        post();
    }, __INTERVAL__);
    post();
})();
</script>`;

const MIME =
{
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.json': 'application/json',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
};

const WALK_PATH = '/__walk.html';
const REPORT_PATH = '/__walk-report';

///////////////////////////////////////////////////////////////////////////////

// Locate an installed Chrome or Edge, or undefined if there is none
function findBrowser()
{
    if (process.env.CHROME_PATH)
        return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : undefined;

    const candidates =
    {
        win32:
        [
            `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
            `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ],
        darwin:
        [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ],
        linux:
        [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
        ],
    }[process.platform] || [];

    return candidates.find(p => p && !p.includes('undefined') && fs.existsSync(p));
}

// Build the instrumented page, injecting the prelude ahead of the game
function instrumentedPage()
{
    const html = fs.readFileSync(join(BUILD_FOLDER, PAGE), 'utf8');
    const at = html.indexOf('<script>');
    if (at < 0)
        throw new Error(`no script tag in ${PAGE}`);

    const prelude = PRELUDE
        .replace('__STEPS__', JSON.stringify(WALK_STEPS))
        .replace('__REPORT__', REPORT_PATH)
        .replace('__WALK_END__', WALK_END)
        .replace('__INTERVAL__', REPORT_INTERVAL);
    return html.slice(0, at) + prelude + html.slice(at);
}

// Serve the build folder plus the instrumented page, and collect its reports
// - the page has to be served from that same folder so tiles.png still resolves
function startServer(onReport)
{
    const server = http.createServer((req, res) =>
    {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === REPORT_PATH)
        {
            let body = '';
            req.on('data', d => body += d);
            req.on('end', ()=>
            {
                res.writeHead(204);
                res.end();
                try { onReport && onReport(JSON.parse(body)); } catch (e) {}
            });
            return;
        }
        if (urlPath === WALK_PATH)
        {
            res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-cache'});
            res.end(instrumentedPage());
            return;
        }

        const filePath = join(BUILD_FOLDER, urlPath);
        if (!filePath.startsWith(BUILD_FOLDER + path.sep))
        {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
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
    });
    return new Promise(resolve =>
        server.listen(0, '127.0.0.1', ()=> resolve({server, port: server.address().port})));
}

// Launch the browser at a url
// - the throwaway profile is not optional, without it the browser hands off
//   to an already running instance and this never gets anywhere
function launchBrowser(browser, url, extraArgs=[])
{
    const args =
    [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${profileFolder}`,
        '--window-size=800,600',
        ...extraArgs,
        url,
    ];
    return spawn(browser, args, {stdio: 'ignore'});
}

///////////////////////////////////////////////////////////////////////////////

const page = join(BUILD_FOLDER, PAGE);
if (!fs.existsSync(page))
{
    console.error(`No release build found at ${page}`);
    console.error(`Run "npm run build" first.`);
    process.exit(1);
}

const browser = findBrowser();
if (!browser)
{
    console.log('SKIPPED: no Chrome or Edge found.');
    console.log('Set CHROME_PATH to a chromium based browser to run this test.');
    process.exit(0);
}

console.log(`Walking the release page with ${path.basename(browser)}...`);
const profileFolder = fs.mkdtempSync(join(os.tmpdir(), 'littlejs-walk-'));
process.on('exit', ()=>
{
    // the browser can still be releasing the profile, and this is only a temp
    // folder the OS will clean up anyway, so never fail the run over it
    try { fs.rmSync(profileFolder, {recursive: true, force: true}); } catch (e) {}
});

// run the walk, resolving with the last report the page sent
const result = await new Promise(async (resolve, reject) =>
{
    let latest;
    const {server, port} = await startServer(report =>
    {
        latest = report;
        if (report.done)
            finish();
    });

    const child = launchBrowser(browser, `http://127.0.0.1:${port}${WALK_PATH}`);
    const timer = setTimeout(finish, BROWSER_TIMEOUT);

    let finished = false;
    function finish()
    {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        server.close();

        // wait for the browser to actually exit before carrying on, otherwise
        // it still holds the profile folder and the cleanup below cannot
        // remove it, leaving a directory behind on every run
        const giveUp = setTimeout(()=> resolve(latest), 5000);
        child.once('close', ()=> { clearTimeout(giveUp); resolve(latest); });
        child.kill();
    }
    child.on('error', e => { clearTimeout(timer); server.close(); reject(e); });
});

// report
if (!result)
{
    console.error('\nThe page never reported back.');
    console.error('That usually means the script never ran, so check the html');
    console.error('shell in build.mjs before looking at the game.');
    process.exit(1);
}

const missed = WALK_STEPS.filter(s => !result.steps.includes(s.name)).map(s => s.name);
let failed = false;

if (result.errors.length)
{
    failed = true;
    console.error(`\n${result.errors.length} page error(s):`);
    for (const e of result.errors)
        console.error('  ' + e);
}
if (result.frames < MIN_FRAMES || result.lastFrame < MIN_LAST_FRAME)
{
    failed = true;
    console.error(`\nThe engine loop is not running.`);
    console.error(`${result.frames} frame(s) drawn, last one at ${result.lastFrame}ms of a ${WALK_END}ms walk.`);
    console.error(`Expected at least ${MIN_FRAMES} frames with the last past ${MIN_LAST_FRAME}ms.`);
}
if (missed.length)
{
    failed = true;
    console.error(`\nWalk steps that never ran: ${missed.join(', ')}`);
}

if (failed)
{
    // leave a screenshot behind, a dead page is much easier to read than a log
    try
    {
        const shot = join(BUILD_FOLDER, 'walk-failure.png');
        const {server, port} = await startServer();
        await new Promise(resolve =>
        {
            const child = launchBrowser(browser, `http://127.0.0.1:${port}${WALK_PATH}`,
                [`--screenshot=${shot}`, '--virtual-time-budget=3000']);
            child.on('close', resolve);
            setTimeout(()=> { child.kill(); resolve(); }, 30000);
        });
        server.close();
        console.error(`\nScreenshot of the failing page: ${shot}`);
    }
    catch (e) {} // the screenshot is a nicety, never the reason the test fails
    process.exit(1);
}

console.log(`Release page OK: ${result.frames} frames over ${result.lastFrame}ms, ` +
    `${result.steps.length} walk steps, no errors.`);
process.exit(0);
