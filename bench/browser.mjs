// headless Chrome for the runners, through playwright-core: it is not a dependency of the repo, so it is looked for
// beside the repo, in the home folder and in the global modules, and the installed Chrome is used through its channel
// headless Chrome renders with SwiftShader, a software GPU, so the numbers compare the engines' JS and driver
// overhead but not real hardware; open the pages in a browser for that
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function launchChrome(swiftShader = true)
{
    let chromium;
    for (const from of [import.meta.url, join(homedir(), 'x'), join(homedir(), 'node_modules', 'x'), 'x'])
    {
        try { chromium = createRequire(from)('playwright-core').chromium; break; }
        catch {}
    }
    if (!chromium)
        throw new Error('playwright-core not found: npm install -g playwright-core, or install it in your home folder');
    const args = swiftShader ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
    try { return await chromium.launch({ channel: 'chrome', args }); }
    catch { return await chromium.launch({ args }); }
}
