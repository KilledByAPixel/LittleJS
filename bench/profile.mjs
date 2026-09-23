// CPU profile of a bench page's JS thread: node bench/profile.mjs "bench/particles.html?n=20000"
// prints the functions with the most self time; the JS time is real even though the GPU is SwiftShader, but a
// page that is GPU bound there renders few frames, so add &aa=0&w=320&h=180 to keep the GPU out of the way
import { serve } from './serve.mjs';
import { launchChrome } from './browser.mjs';
const url = process.argv[2] || 'bench/cubes.html?n=5000';
const server = await serve(), base = 'http://localhost:' + server.address().port + '/';
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(base + url);
await page.waitForTimeout(3000); // past the warm up
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const framesBefore = await page.evaluate(()=> window.benchFrames || 0);
await page.waitForTimeout(5000);
const { profile } = await cdp.send('Profiler.stop');
const frames = await page.evaluate(()=> window.benchFrames || 0) - framesBefore;
await browser.close();
server.close();

// self time per function from the samples
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const counts = new Map();
for (const id of profile.samples)
    counts.set(id, (counts.get(id) || 0) + 1);
const total = profile.samples.length, self = new Map();
for (const [id, count] of counts)
{
    const { callFrame } = byId.get(id);
    const name = (callFrame.functionName || '(anonymous)') + ' ' + callFrame.url.split('/').pop() + ':' + (callFrame.lineNumber + 1);
    self.set(name, (self.get(name) || 0) + count);
}
const dt = (profile.endTime - profile.startTime) / 1000 / total; // ms per sample
const idle = [...counts].filter(([id]) => byId.get(id).callFrame.functionName == '(idle)').reduce((a, [, c]) => a + c, 0);
console.log('sampled', (total * dt / 1000).toFixed(1), 's, JS busy', ((total - idle) * dt / 1000).toFixed(2), 's over', frames, 'rendered frames =', frames ? ((total - idle) * dt / frames).toFixed(2) : '?', 'ms of JS per frame');
for (const [name, count] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log((100 * count / total).toFixed(1).padStart(5) + '%', name);
