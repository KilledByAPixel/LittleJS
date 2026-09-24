import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('the ESM bundle imports in plain Node with no browser stubs, so a server can set headless mode after it', () =>
{
    // its own process, so the import sees no window, document or AudioContext at all
    const script = "const LJS = await import('./dist/littlejs.esm.js'); LJS.setHeadlessMode(true); console.log('ok ' + typeof LJS.engineInit)";
    const out = execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(out.trim(), 'ok function');
});
