import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    drawRect, drawTile, drawLine, drawCircle, drawEllipse, drawPoly, drawLineList, drawRectGradient, drawCanvas2D,
    drawText, drawTextScreen, setHeadlessMode, SpriteAnimation, TileInfo, TextureInfo, textureInfos, loadTexture,
    tile, vec2, WHITE, BLACK,
} from '../dist/littlejs.esm.js';

// review round 5 regressions: the draw functions and textures

test('draws do nothing in headless mode, not only drawEllipseGradient and drawTextureWrapped', () =>
{
    // headless keeps glEnable on with no GL context and no draw context, so these used to assert or throw
    let called = false;
    const points = [vec2(0, 0), vec2(1, 0), vec2(0, 1)];
    const draws = {
        drawRect: ()=> drawRect(vec2(), vec2(1)),
        drawTile: ()=> drawTile(vec2(), vec2(1), tile(0, 16)),
        drawLine: ()=> drawLine(vec2(), vec2(1)),
        drawCircle: ()=> drawCircle(vec2(), 1),
        drawEllipse: ()=> drawEllipse(vec2(), vec2(2, 1)),
        drawPoly: ()=> drawPoly(points),
        drawLineList: ()=> drawLineList(points),
        drawRectGradient: ()=> drawRectGradient(vec2(), vec2(1)),
        drawText: ()=> drawText('hi', vec2()),
        drawTextScreen: ()=> drawTextScreen('hi', vec2(), 12),
        drawCanvas2D: ()=> drawCanvas2D(vec2(), vec2(1), 0, false, ()=> called = true),
    };
    for (const name in draws)
        assert.doesNotThrow(draws[name], name);
    assert.equal(called, false, 'drawCanvas2D does not call its function headless');

    // a context passed in is still drawn to, the text tests rely on that
    const context = { save(){}, restore(){}, translate(){}, rotate(){}, scale(){} };
    drawCanvas2D(vec2(), vec2(1), 0, false, ()=> called = true, false, context);
    assert.equal(called, true, 'drawCanvas2D draws to a context passed in');
});

// a stand-in 2D context that throws on a negative ellipse radius like a real one and records the strokes
const shapeContext = ()=>
{
    const strokes = [];
    let lineWidth = 1;
    return {
        strokes, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, beginPath(){}, closePath(){},
        lineTo(){}, fill(){},
        ellipse(x, y, rx, ry)
        {
            if (rx < 0 || ry < 0)
                throw new Error('IndexSizeError: the radius is negative');
        },
        get lineWidth() { return lineWidth; },
        set lineWidth(w) { if (w > 0) lineWidth = w; }, // Canvas2D ignores 0 and below
        stroke() { strokes.push(lineWidth); },
    };
};

// the Canvas2D paths are only reachable outside headless mode, a passed context stands in for the canvas
const withoutHeadless = (f)=>
{
    setHeadlessMode(false);
    try { f(); }
    finally { setHeadlessMode(true); }
};

test('Canvas2D drawCircle and drawEllipse take a negative size like WebGL does, and do not throw', () =>
{
    withoutHeadless(()=>
    {
        const context = shapeContext();
        assert.doesNotThrow(()=> drawCircle(vec2(), -1, WHITE, 0, BLACK, false, false, context));
        assert.doesNotThrow(()=> drawEllipse(vec2(), vec2(-2, 1), WHITE, 0, .5, BLACK, false, false, context));
        assert.deepEqual(context.strokes, [.5], 'a negative size still gets its outline, clamped by its magnitude');
    });
});

test('Canvas2D outlines with a width of 0 or below draw nothing, where they stroked with the last width', () =>
{
    withoutHeadless(()=>
    {
        const context = shapeContext(), points = [vec2(0, 0), vec2(1, 0), vec2(0, 1)];
        drawCircle(vec2(), -2, WHITE, 0, BLACK, false, false, context); // clamped against a negative size
        drawPoly(points, WHITE, -1, BLACK, vec2(), 0, false, false, context);
        drawLineList(points, 0, WHITE, false, vec2(), 0, false, false, context);
        assert.deepEqual(context.strokes, []);

        // a negative line list width draws as its size, as the WebGL outline does
        drawLineList(points, -.25, WHITE, false, vec2(), 0, false, false, context);
        assert.deepEqual(context.strokes, [.25]);
    });
});

test('a SpriteAnimation played once backward runs from the last frame to the first, then is done', () =>
{
    const first = new TileInfo(vec2(), vec2(16), undefined);
    const animation = new SpriteAnimation(first, 4, .1).play();
    animation.speed = -1;
    assert.equal(animation.frame, 3, 'the last frame from the start');
    animation.startTime -= .05; // half a frame in
    assert.equal(animation.frame, 3);
    animation.startTime -= .2; // 2.5 frames in
    assert.equal(animation.frame, 1);
    animation.startTime -= .1; // 3.5 frames in, the first frame shows for its time
    assert.equal(animation.frame, 0);
    assert.equal(animation.isDone, false);
    animation.startTime -= .1; // 4.5 frames in
    assert.equal(animation.frame, 0, 'holds the first frame');
    assert.equal(animation.isDone, true);

    // forward is unchanged
    const forward = new SpriteAnimation(first, 4, .1).play();
    forward.startTime -= .25;
    assert.equal(forward.frame, 2);
    assert.equal(forward.isDone, false);
    forward.startTime -= .2;
    assert.equal(forward.frame, 3);
    assert.equal(forward.isDone, true);
});

test('loadTexture warns when the image fails to load, and resolves to the TextureInfo', async () =>
{
    const savedImage = globalThis.Image, savedWarn = console.warn, warnings = [];
    globalThis.Image = class
    {
        width = 0; height = 0; // a failed image has no size
        set src(value) { queueMicrotask(()=> this.onerror?.()); }
    };
    console.warn = (...args)=> warnings.push(args.join(' '));
    const index = textureInfos.length; // the next unused one
    try
    {
        const info = await loadTexture(index, 'missing.png');
        assert.ok(info instanceof TextureInfo, 'resolves to the texture info');
        assert.equal(textureInfos[index], info);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /missing\.png/);
    }
    finally
    {
        globalThis.Image = savedImage;
        console.warn = savedWarn;
        textureInfos.length = index; // drop the test's texture
    }
});

test('the d.ts types textAlign as the three values drawTextScreen accepts, and loadTexture resolves to a TextureInfo', () =>
{
    const dts = readFileSync('dist/littlejs.d.ts', 'utf8');
    const signature = (name)=> dts.split('\n').find(line => line.includes('export function ' + name + '('));
    const align = /textAlign\?: ["']left["'] \| ["']center["'] \| ["']right["']/;
    assert.match(signature('drawText'), align);
    assert.match(signature('drawTextScreen'), align);
    assert.match(signature('loadTexture'), /Promise<TextureInfo>/);
});
