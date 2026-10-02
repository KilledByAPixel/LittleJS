import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, TileCollisionLayer, vec2, engineStep, engineInit, setEngineManualStep, setGravity,
    setCameraPos, setCameraAngle, setCameraScale, screenToWorld, worldToScreen, screenToWorldDelta,
    worldToScreenDelta } = LJS;

// review round 5 regressions for the examples and docs area: the platformer core (an object landing on a tile
// collision layer), the 2D screen and world conversions, and the house style of the shorts

// one engineInit for the file, frame and time are module globals
setEngineManualStep(true);
await engineInit(()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{});

// a layer 20 wide with its bottom row solid, so the floor's top is at y = 1
function makeFloor()
{
    const layer = new TileCollisionLayer(vec2(), vec2(20, 10));
    for (let x = 0; x < 20; ++x)
        layer.setCollisionData(vec2(x, 0));
    return layer;
}

function cleanUp(...objects)
{
    for (const o of objects) o.destroy();
    engineStep();
}

test('an EngineObject falls onto a tile collision layer and rests on it', () =>
{
    // guards the core of every platformer: gravity, setCollision and tile collision together
    setGravity(vec2(0, -.02));
    const floor = makeFloor();
    const o = new EngineObject(vec2(10, 6), vec2(1));
    o.setCollision();
    engineStep(300);
    assert.equal(o.groundObject, floor, 'grounded on the layer');
    assert.ok(o.velocity.y === 0, 'y velocity zeroed, got ' + o.velocity.y);
    assert.ok(Math.abs(o.pos.y - 1.5) < 1e-3, 'rests on the floor top, got ' + o.pos.y);
    assert.ok(Math.abs(o.pos.x - 10) < 1e-9, 'no sideways drift, got ' + o.pos.x);
    cleanUp(o, floor);
    setGravity(vec2());
});

test('an object falling at objectMaxSpeed does not tunnel through a one tile floor', () =>
{
    // guards the speed clamp and the tile test against a thin floor at the fastest allowed fall
    setGravity(vec2(0, -.02));
    const floor = makeFloor();
    const o = new EngineObject(vec2(10.3, 9.25), vec2(1));
    o.setCollision();
    o.velocity = vec2(0, -5); // clamped to objectMaxSpeed each frame
    let lowest = Infinity;
    for (let i = 0; i < 120; ++i)
    {
        engineStep();
        lowest = Math.min(lowest, o.pos.y);
    }
    assert.ok(lowest > 1.5 - 1e-3, 'never sank into the floor, lowest ' + lowest);
    assert.equal(o.groundObject, floor);
    assert.ok(Math.abs(o.pos.y - 1.5) < 1e-3, 'rests on the floor top, got ' + o.pos.y);
    cleanUp(o, floor);
    setGravity(vec2());
});

test('an object with restitution bounces off a tile floor and settles above it', () =>
{
    // guards the tile bounce: velocity flips up by restitution and the object never ends inside the floor
    setGravity(vec2(0, -.02));
    const floor = makeFloor();
    const o = new EngineObject(vec2(10, 6), vec2(1));
    o.setCollision();
    o.restitution = .8;
    let bounced = false, falling = false, peakAfterBounce = 0, lowest = Infinity;
    for (let i = 0; i < 200; ++i)
    {
        engineStep();
        lowest = Math.min(lowest, o.pos.y);
        if (o.velocity.y < 0)
            falling = true;
        else if (falling && o.velocity.y > 0)
            bounced = true; // moving up after it was falling
        if (bounced)
            peakAfterBounce = Math.max(peakAfterBounce, o.pos.y);
    }
    assert.ok(bounced, 'velocity turned upward at the floor');
    assert.ok(peakAfterBounce > 3, 'rose well off the floor after the bounce, peak ' + peakAfterBounce);
    assert.ok(lowest > 1.5 - 1e-3, 'never sank into the floor, lowest ' + lowest);
    cleanUp(o, floor);
    setGravity(vec2());
});

test('screenToWorld and worldToScreen are inverses with the camera moved, zoomed and turned', () =>
{
    // guards the 2D conversions, which were only used as an oracle in the box2d test
    const size = LJS.mainCanvasSize, oldSize = size.copy();
    const oldPos = LJS.cameraPos.copy(), oldAngle = LJS.cameraAngle, oldScale = LJS.cameraScale;
    size.x = 800; size.y = 600;
    try
    {
        // the camera center maps to the middle of the canvas, pixel centers at half steps
        setCameraPos(vec2(3, -2)); setCameraAngle(0); setCameraScale(40);
        const center = worldToScreen(vec2(3, -2));
        assert.ok(Math.abs(center.x - 399.5) < 1e-9 && Math.abs(center.y - 299.5) < 1e-9, 'center ' + center);
        const up = worldToScreen(vec2(3, -1)); // world y is up, screen y is down
        assert.ok(Math.abs(up.y - (299.5 - 40)) < 1e-9, 'one unit up is 40 pixels up, got ' + up.y);

        for (const angle of [0, .7, -2.5, Math.PI])
        for (const scale of [1, 32, 77.5])
        {
            setCameraPos(vec2(3, -2)); setCameraAngle(angle); setCameraScale(scale);
            for (const p of [vec2(), vec2(3, -2), vec2(-7.25, 11.5), vec2(100, -40)])
            {
                const back = screenToWorld(worldToScreen(p));
                assert.ok(back.distance(p) < 1e-9, `world ${p} came back as ${back}, angle ${angle} scale ${scale}`);
                const delta = screenToWorldDelta(worldToScreenDelta(p));
                assert.ok(delta.distance(p) < 1e-9, `delta ${p} came back as ${delta}`);
            }
            const s = vec2(123, 456);
            const screenBack = worldToScreen(screenToWorld(s));
            assert.ok(screenBack.distance(s) < 1e-9, `screen ${s} came back as ${screenBack}`);
        }
    }
    finally
    {
        size.x = oldSize.x; size.y = oldSize.y;
        setCameraPos(oldPos); setCameraAngle(oldAngle); setCameraScale(oldScale);
    }
});

test('shorts stay within 80 columns and write their colors with hsl', () =>
{
    // guards the house style of examples/shorts; colors.js shows rgb on purpose
    const dir = new URL('../examples/shorts/', import.meta.url);
    const long = [], rgbUses = [];
    for (const file of fs.readdirSync(dir).filter(f=> f.endsWith('.js')))
    {
        const lines = fs.readFileSync(new URL(file, dir), 'utf8').split(/\r?\n/);
        lines.forEach((line, i)=>
        {
            if (line.length > 80)
                long.push(`${file}:${i+1} (${line.length})`);
            if (file !== 'colors.js' && /(^|[^.\w])rgb\(/.test(line))
                rgbUses.push(`${file}:${i+1}`);
        });
    }
    assert.deepEqual(long, [], 'lines over 80 columns');
    assert.deepEqual(rgbUses, [], 'rgb( in a short, use hsl');
});

test('a short starts with code and ends with its info block, when it has one', () =>
{
    // guards the write-up the example browser shows: a block comment that starts with the line /* info and
    // is the last thing in the file, which is where the browser looks for it. What a short is about goes
    // there, not in a comment at its top: one with a blank line after it, which a comment on the first
    // declaration does not have
    const dir = new URL('../examples/shorts/', import.meta.url);
    const headers = [], badBlocks = [];
    for (const file of fs.readdirSync(dir).filter(f=> f.endsWith('.js')))
    {
        const source = fs.readFileSync(new URL(file, dir), 'utf8').replace(/\r\n/g, '\n');
        if (/^\s*(\/\/.*\n)+\n/.test(source))
            headers.push(file);
        const blocks = source.match(/\/\*/g) || [];
        if (!blocks.length)
            continue;
        const match = /\n\/\* info\n([\s\S]*)\*\/\s*$/.exec(source);
        if (blocks.length > 1 || !match || !match[1].trim() || match[1].includes('*/'))
            badBlocks.push(file);
    }
    assert.deepEqual(headers, [], 'shorts that start with a comment: it belongs in the info block');
    assert.deepEqual(badBlocks, [], 'a short has one block comment at most, its info block, the last thing in it');
});

test('every short and full example in the example browser has a write-up', () =>
{
    // the info box is never empty: a short listed in examples/shorts.js ends with an info block that says how
    // it works, and a full example, which is a folder, has its write-up in fullExampleInfo there
    const list = fs.readFileSync(new URL('../examples/shorts.js', import.meta.url), 'utf8');
    const names = [...list.matchAll(/new ExampleInfo\('([^']*)', '[^']+'/g)].map((m)=> m[1]);
    const missing = [], unlinked = [];
    for (const [, file] of list.matchAll(/new ExampleInfo\('[^']*', '([\w-]+\.js)'/g))
    {
        const source = fs.readFileSync(new URL('../examples/shorts/' + file, import.meta.url), 'utf8');
        const block = /\n\/\* info\r?\n([\s\S]*)\*\//.exec(source);
        if (!block || !block[1].includes('\n## How it works'))
            missing.push(file);
        // See also names other examples as the list has them, which is how the browser links to them
        const seeAlso = block && block[1].split('## See also')[1];
        if (seeAlso && !names.some((name)=> seeAlso.includes(name)))
            unlinked.push(file);
    }
    assert.deepEqual(missing, [], 'shorts with no write-up, or one with no How it works');
    assert.deepEqual(unlinked, [], 'shorts whose See also names no example in the list');

    const full = [...list.matchAll(/new ExampleInfo\('[^']*', '([\w-]+)', '[^']*', true, '[^']*'(, fullExampleInfo)?/g)];
    assert.ok(full.length > 5, 'the full examples are where the test looks for them');
    for (const [, folder, info] of full)
        assert.ok(info && new RegExp(`\\n'?${folder}'?: \``).test(list), folder + ' has no write-up in fullExampleInfo');
});

test('the shorts that assigned undeclared globals now declare them, so they run under use strict', () =>
{
    // guards the example browser's Use Strict box: these names were assigned without a declaration
    const dir = new URL('../examples/shorts/', import.meta.url);
    const names =
    {
        'box2d.js': ['mouseJoint', 'groundObject'],
        'box2dPool.js': ['cueBall'],
        'box2dTileLayer.js': ['box2DTileLayer'],
        'lightSystem.js': ['mouseLight'],
        'music.js': ['musicPlayer', 'infoText', 'playButton', 'stopButton'],
        'musicPlayer.js': ['musicPlayer', 'playButton', 'stopButton', 'progressBar'],
        'particles.js': ['comet'],
        'save.js': ['saveData'],
        'spriteAtlas.js': ['spriteAtlas'],
        'timers.js': ['timerButton', 'timerSlider'],
        'videoPlayer.js': ['videoPlayer'],
    };
    for (const [file, list] of Object.entries(names))
    {
        const source = fs.readFileSync(new URL(file, dir), 'utf8');
        // the top level let and const lines, where a short keeps its globals
        const declared = source.split(/\r?\n/).filter(l=> /^(let|const) /.test(l)).join(' ');
        for (const name of list)
            assert.match(declared, new RegExp(`\\b${name}\\b`), `${file} declares ${name}`);
    }
});
