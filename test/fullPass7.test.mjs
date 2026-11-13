import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 7 of 2026-11-13: a level's scene block does not carry into the next level

test('a level with no scene block shows the scene the game set, not the last level\'s', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            render3D.fogStart = 10; render3D.fogEnd = 20; render3D.shadows = false;
            const sky = render3D.sky, sun = render3D.sunDirection.copy();
            level3DLoad({scene: {fog: [1, 2], shadows: true, sky: ['#ff0000', '#00ff00', '#0000ff'],
                sunDirection: [1, 0, 0], lensFlare: true}, objects: []});
            const during = [render3D.fogEnd, render3D.shadows, render3D.sky !== sky, level3DSunHasFlare()];
            level3DLoad({objects: []});
            JSON.stringify({during, after: [render3D.fogStart, render3D.fogEnd, render3D.shadows, render3D.sky === sky,
                render3D.sunDirection.subtract(sun).length(), level3DSunHasFlare()]})`));
        assert.deepEqual(result.during, [2, true, true, true], file + ': the level\'s block');
        assert.deepEqual(result.after, [10, 20, false, true, 0, false], file + ': the game\'s scene again');
    }
});
