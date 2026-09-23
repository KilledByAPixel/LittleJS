// run bench pages headless and print one line per result
//   node bench/run.mjs particles              runs particles.html and particles.three.html at a few sizes
//   node bench/run.mjs particles 5000 20000   at those sizes; dynamic and bigmesh take cells per side
//   node bench/run.mjs sprites2d -- aa=0      adds &aa=0 to every page of the pair
//   node bench/run.mjs "bench/particles.html?n=20000&sort=0" ...   any page urls from the repo root
// headless Chrome renders with SwiftShader, a software GPU, so the numbers compare the engines' JS and driver
// overhead but not real hardware; open the pages in a browser for that
import { serve } from './serve.mjs';
import { launchChrome } from './browser.mjs';
const args = process.argv.slice(2), split = args.indexOf('--');
const extra = split < 0 ? '' : '&' + args.slice(split + 1).join('&');
const [bench, ...sizeArgs] = split < 0 ? args : args.slice(0, split);
const pairs = {
    cubes: { key: 'n', sizes: [2000, 10000, 30000], pages: ['cubes.html', 'cubes.three.html'] },
    particles: { key: 'n', sizes: [5000, 20000, 50000], pages: ['particles.html', 'particles.three.html'] },
    sprites: { key: 'n', sizes: [2000, 10000], pages: ['sprites.html', 'sprites.three.html'] },
    dynamic: { key: 's', sizes: [64, 128, 256], pages: ['dynamic.html', 'dynamic.three.html'] },
    bigmesh: { key: 's', sizes: [300, 500], pages: ['bigmesh.html', 'bigmesh.three.html'] },
    sprites2d: { key: 'n', sizes: [10000, 50000], pages: ['sprites2d.html', 'sprites2d.pixi.html', 'sprites2d.phaser.html'] },
};
let urls = [];
if (pairs[bench])
{
    const { key, sizes, pages } = pairs[bench];
    for (const n of sizeArgs.length ? sizeArgs : sizes)
        for (const page of pages)
            urls.push(`bench/${page}?${key}=${n}`);
}
else if (bench)
    urls = [bench, ...sizeArgs];
else
{
    console.log('usage: node bench/run.mjs <' + Object.keys(pairs).join('|') + '> [sizes...] [-- extra query], or page urls');
    process.exit(1);
}
const server = serve(8765);
const browser = await launchChrome();
for (const url of urls)
{
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
    page.on('console', m => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text().slice(0, 160)));
    await page.goto('http://localhost:8765/' + url + extra);
    let result;
    try
    {
        await page.waitForFunction(()=> window.benchResult, undefined, { timeout: 240000 });
        result = await page.evaluate(()=> window.benchResult);
    }
    catch { result = { ms: 'timeout', fps: '', gpu: '', perFrame: '' }; }
    const more = Object.entries(result).filter(([k])=> !['engine', 'n', 'ms', 'fps', 'gpu', 'logged', 'perFrame'].includes(k)).map(([k, v])=> `${k} ${v}`).join(', ');
    console.log(url.replace('bench/', '').padEnd(44), 'frame', String(result.ms).padStart(7), 'ms, gpu', String(result.gpu).padStart(7), 'ms, js', String(result.perFrame).padStart(6), more, errors.join(' | '));
    await page.close();
}
await browser.close();
server.close();
