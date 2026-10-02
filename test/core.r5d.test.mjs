import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ImageFont, TileInfo, TextureInfo, vec2, WHITE } from '../dist/littlejs.esm.js';

// Review 5 decisions for the core files. What needs a browser, a custom rootElement keeping its styles and
// holding the canvas, and smooth textures of any size getting mipmaps, is checked there instead.

// a stand-in 2D context that records where each glyph is drawn, the translate drawCanvas2D does per tile
function glyphContext()
{
    const translates = [];
    return { translates, save(){}, restore(){}, rotate(){}, scale(){}, drawImage(){},
        translate(x, y) { translates.push([x, y]); } };
}

test('ImageFont centers the lines of multi-line text vertically when center is set, like drawTextScreen', () =>
{
    // an 8x8 font in a 256x24 image, drawn to a passed context since headless has no canvas
    const font = new ImageFont(new TileInfo(vec2(), vec2(8), new TextureInfo({width:256, height:24}, false)));
    const lineYs = (center)=>
    {
        const context = glyphContext();
        font.drawTextScreen('A\nB\nC', vec2(100, 100), 10, center, WHITE, false, context);
        return context.translates.map(([x, y])=> y);
    };
    assert.deepEqual(lineYs(true), [90, 100, 110], 'three lines centered on pos');
    assert.deepEqual(lineYs(false), [100, 110, 120], 'without center the first line starts at pos');

    // one line is unchanged either way
    const context = glyphContext();
    font.drawTextScreen('AB', vec2(100, 100), 10, true, WHITE, false, context);
    assert.deepEqual(context.translates, [[105, 100], [95, 100]]);
});

test('readSaveData carries the type of its default through, writeSaveData takes an object', () =>
{
    // any in the d.ts let every mistake through, so each line marked here must be an error now
    const dir = mkdtempSync(join(tmpdir(), 'ljs-save-'));
    const usage = `import { readSaveData, writeSaveData } from 'littlejsengine';
const save = readSaveData('game', {best: 0, name: ''});
const best: number = save.best;
// @ts-expect-error best is a number
const wrong: string = save.best;
// @ts-expect-error the default must be an object
readSaveData('game', 5);
const loose = readSaveData('game'); // no default is still any
loose.whatever.goes;
interface Save { best: number }
const typed = readSaveData<Save>('game');
typed.best.toFixed();
writeSaveData('game', save);
// @ts-expect-error save data is an object
writeSaveData('game', 5);
export { best, wrong };
`;
    writeFileSync(join(dir, 'usage.ts'), usage);
    const config = { compilerOptions: { noEmit: true, strict: true, target: 'es2022', module: 'esnext',
        moduleResolution: 'bundler', lib: ['es2022', 'dom'], types: [] },
        files: [resolve('dist/littlejs.d.ts'), join(dir, 'usage.ts')] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config));
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    assert.equal(output.trim(), '', output);
});
