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
        'particles.js': ['cometEmitter'],
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
