/*
 * LittleJS 3D Debug Plugin
 * - debugBox3D, debugSphere3D, debugLine3D and debugPoint3D, drawn on top of the 3D scene like the 2D debug functions
 * - Debug builds only, like the 2D ones: engineRelease.js has empty stubs for these, so release builds carry none of it
 * - Goes after the Render3D plugin, part of its Render3D namespace
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

const RENDER3D_DEBUG_WIDTH = .05; // line width of the debug primitives

let render3DDebugPrimitives = []; // each keeps the debugClear count it was made under, a debugClear since drops it

// draw the live debug primitives with depth test off so they show through walls, drop the expired ones
function render3DRenderDebug()
{
    if (!render3DDebugPrimitives.length) return;
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.clearCount === debugClearCount);
    // unfogged and unfaded, and flushed while so, as fog is read when a batch draws, so one far off still shows;
    // what the game drew before goes first, under its own fog
    render3D.flush();
    render3DWithState({lighting: false, depthTest: false, receiveShadow: false, additive: false, shader: undefined,
        emissiveMap: undefined, fogEnd: 0, fogFadeStart: 0, fogFadeEnd: 0}, ()=>
    {
        for (const p of render3DDebugPrimitives)
            p.draw();
        render3D.flush();
    });
    render3DDebugPrimitives = render3DDebugPrimitives.filter(p=> p.timer < 0); // a Timer compares as negative until it elapses
}

// record a debug draw for a time
function render3DDebugPush(duration, draw)
{
    ASSERT(isNumber(duration), 'duration must be a number');
    debug && glEnable && render3D?.program &&
        render3DDebugPrimitives.push({timer: new Timer(duration, true), draw, clearCount: debugClearCount}); // real time, like 2D
}

// a debug draw's color as it is now: a Color copied, or a CSS color string, as the 2D debug draws take one, read
// by a canvas, which gives a name or rgb() back as hex or rgba()
/** @type {CanvasRenderingContext2D|undefined} */
let render3DDebugColorContext;
/** @param {Color|string} color
 *  @return {Color} */
function render3DDebugColor(color)
{
    if (isColor(color)) return color.copy();
    ASSERT(isStringLike(color), 'a 3D debug color is a Color or a CSS color string', color);
    let text = color + '';
    if (text[0] !== '#' && typeof document != 'undefined')
    {
        const context = render3DDebugColorContext ||= document.createElement('canvas').getContext('2d') ?? undefined;
        if (context)
        {
            context.fillStyle = '#fff';
            context.fillStyle = text;
            text = String(context.fillStyle);
        }
    }
    if (text[0] === '#')
        return new Color().setHex(text);
    const rgba = text.match(/rgba?\(([^)]*)\)/)?.[1].split(',').map(Number);
    return rgba && rgba.length >= 3 ? rgb(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] ?? 1) : WHITE.copy();
}

/** Draw a debug wireframe box
 *  @param {Vector3} pos - Center
 *  @param {Vector3|number} [size] - Full size, a number for a cube
 *  @param {Color|string} [color] - A Color or a CSS color, as '#f00' or 'red'
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {Vector3} [rotation] - vec3(pitch, yaw, roll)
 *  @memberof Render3D */
function debugBox3D(pos, size=1, color=WHITE, time=0, rotation)
{
    const matrix = buildMatrix(pos, rotation, render3DSize3(size));
    const drawColor = render3DDebugColor(color); // as it is now, a timed one keeps it when the caller changes theirs
    const corner = (i)=> matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
    render3DDebugPush(time, ()=>
    {
        for (let i = 0; i < 8; ++i)
        for (const bit of [1, 2, 4])
            if (!(i & bit))
                render3D.drawLine(corner(i), corner(i | bit), RENDER3D_DEBUG_WIDTH, drawColor);
    });
}

/** Draw a debug wireframe sphere as three rings
 *  @param {Vector3} pos - Center
 *  @param {number} [size] - Diameter
 *  @param {Color|string} [color] - A Color or a CSS color, as '#f00' or 'red'
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugSphere3D(pos, size=1, color=WHITE, time=0)
{
    pos = pos.copy(); // as they are now, a timed one keeps them
    const drawColor = render3DDebugColor(color), circle = render3DCircle(24), r = size / 2;
    render3DDebugPush(time, ()=>
    {
        for (const ring of [(c, s)=> vec3(c, s, 0), (c, s)=> vec3(c, 0, s), (c, s)=> vec3(0, c, s)])
        {
            const points = [];
            for (let i = 0; i <= 24; ++i)
                points.push(pos.add(ring(circle[i*2], circle[i*2 + 1]).scale(r)));
            render3D.drawRibbon(points, RENDER3D_DEBUG_WIDTH, undefined, drawColor);
        }
    });
}

/** Draw a debug line
 *  @param {Vector3} posA
 *  @param {Vector3} posB
 *  @param {Color|string} [color] - A Color or a CSS color, as '#f00' or 'red'
 *  @param {number} [width]
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @memberof Render3D */
function debugLine3D(posA, posB, color=WHITE, width=RENDER3D_DEBUG_WIDTH, time=0)
{
    // as they are now, a timed one stays put when the ends or the color change
    posA = posA.copy(), posB = posB.copy();
    const drawColor = render3DDebugColor(color);
    render3DDebugPush(time, ()=> render3D.drawLine(posA, posB, width, drawColor));
}

/** Draw a debug point as a small cross of three lines
 *  @param {Vector3} pos
 *  @param {Color|string} [color] - A Color or a CSS color, as '#f00' or 'red'
 *  @param {number} [time] - How long to show it, 0 is one frame
 *  @param {number} [size] - Length of the cross
 *  @memberof Render3D */
function debugPoint3D(pos, color=WHITE, time=0, size=.2)
{
    pos = pos.copy(); // as they are now, a timed one keeps them
    const drawColor = render3DDebugColor(color);
    render3DDebugPush(time, ()=>
    {
        for (const axis of [vec3(size / 2, 0, 0), vec3(0, size / 2, 0), vec3(0, 0, size / 2)])
            render3D.drawLine(pos.subtract(axis), pos.add(axis), RENDER3D_DEBUG_WIDTH, drawColor);
    });
}
