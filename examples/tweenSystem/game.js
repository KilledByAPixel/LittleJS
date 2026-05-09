/*
    LittleJS Tween System Example
    - Demonstrates every public feature of the tween plugin
    - 1) Property tween, 2) Callback tween, 3) Chaining, 4) Loop+PingPong,
      5) Easing showcase, 6) Real-time tween that survives pause
*/

'use strict';

import * as LJS from '../../dist/littlejs.esm.js';
const { vec2, hsl, drawRect, drawText } = LJS;
const { Tween, tweenProperty, Ease } = LJS;

LJS.setCanvasFixedSize(vec2(1920, 1080));
LJS.setCanvasPixelated(false);

///////////////////////////////////////////////////////////////////////////////
// Layout — world-space row positions

const ROW_PROPERTY  =  9;
const ROW_COUNTDOWN =  7.2;
const ROW_CHAIN     =  5.4;
const ROW_LOOP      =  3.6;
const ROW_PINGPONG  =  1.8;
const ROW_EASE_TOP  =  0;
const EASE_SPACING  =  1.2;
const ROW_REALTIME  = -10.0;
const ROW_VECTOR2   = -11.7;
const ROW_COLOR     = -13.2;
const LABEL_X       = -9;

///////////////////////////////////////////////////////////////////////////////
// State

const moverObj    = { pos: vec2(-5, ROW_PROPERTY) };
const chainObj    = { pos: vec2(-5, ROW_CHAIN), size: 1 };
const loopObj     = { pos: vec2(-5, ROW_LOOP) };
const pingPongObj = { pos: vec2(-5, ROW_PINGPONG) };
const realObj     = { pos: vec2(-5, ROW_REALTIME) };
const vec2Obj     = { pos: vec2(-5, ROW_VECTOR2 + 0.4) };
const colorObj    = { pos: vec2(0, ROW_COLOR), color: hsl(0, 0.8, 0.6) };
let   countdownValue = 10;

const easingDemos =
[
    ['LINEAR',         Ease.LINEAR],
    ['OUT(SINE)',      Ease.OUT(Ease.SINE)],
    ['OUT(POWER(2))',  Ease.OUT(Ease.POWER(2))],
    ['OUT(BACK)',      Ease.OUT(Ease.BACK)],
    ['OUT(ELASTIC)',   Ease.OUT(Ease.ELASTIC)],
    ['OUT(BOUNCE)',    Ease.OUT(Ease.BOUNCE)],
    ['IN_OUT(POW(3))', Ease.IN_OUT(Ease.POWER(3))],
    ['BEZIER',         Ease.BEZIER(0.25, 0.1, 0.25, 1)],
];
const easingObjs = easingDemos.map((_, i) => ({
    pos: vec2(-5, ROW_EASE_TOP - i * EASE_SPACING)
}));

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    LJS.setCanvasClearColor(hsl(0, 0, 0.1));

    // 1) Basic property tween, ping-pong forever
    tweenProperty(moverObj.pos, 'x', -5, 5, 2).pingPong();

    // 2) Callback tween — countdown 10 → 0 looping forever
    new Tween((v) => { countdownValue = v; }, 10, 0, 5).loop();

    // 3) Chaining: slide right, then shrink, then restart the chain
    startChain();

    // 4) Loop forever and PingPong forever on adjacent rows
    tweenProperty(loopObj.pos, 'x', -5, 5, 1.5).loop();
    tweenProperty(pingPongObj.pos, 'x', -5, 5, 1.5).pingPong();

    // 5) Easing showcase — each row uses a different curve, all ping-pong
    for (let i = 0; i < easingDemos.length; i++)
    {
        const [, easeFn] = easingDemos[i];
        tweenProperty(easingObjs[i].pos, 'x', -5, 5, 2)
            .setEase(easeFn)
            .pingPong();
    }

    // 6) Real-time tween — keeps moving while game is paused
    tweenProperty(realObj.pos, 'x', -5, 5, 2, { useRealTime: true }).pingPong();

    // 7) Vector2 tween — moves diagonally (interpolates both x and y)
    tweenProperty(vec2Obj, 'pos',
        vec2(-5, ROW_VECTOR2 + 0.4),
        vec2( 5, ROW_VECTOR2 - 0.4),
        2).pingPong();

    // 8) Color tween — pulses between two colors using Color.lerp()
    tweenProperty(colorObj, 'color', hsl(0, 0.8, 0.6), hsl(0.6, 0.8, 0.6), 2).pingPong();
}

function startChain()
{
    chainObj.pos.x = -5;
    chainObj.size = 1;
    new Tween((v) => { chainObj.pos.x = v; }, -5, 5, 1.5)
        .then(() =>
        {
            new Tween((v) => { chainObj.size = v; }, 1, 0.2, 0.8)
                .then(startChain);
        });
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate() { }

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // Press P to toggle pause; the real-time row keeps moving regardless.
    if (LJS.keyWasPressed('KeyP')) LJS.setPaused(!LJS.getPaused());
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    drawRect(moverObj.pos,    vec2(0.8), hsl(0.60, 0.8, 0.6));
    drawRect(chainObj.pos,    vec2(chainObj.size), hsl(0.05, 0.8, 0.6));
    drawRect(loopObj.pos,     vec2(0.8), hsl(0.30, 0.8, 0.6));
    drawRect(pingPongObj.pos, vec2(0.8), hsl(0.50, 0.8, 0.6));
    for (let i = 0; i < easingObjs.length; i++)
        drawRect(easingObjs[i].pos, vec2(0.6), hsl(i / easingObjs.length, 0.8, 0.6));
    drawRect(realObj.pos,     vec2(0.8), hsl(0.85, 0.8, 0.6));
    drawRect(vec2Obj.pos,     vec2(0.8), hsl(0.15, 0.8, 0.6));
    drawRect(colorObj.pos,    vec2(0.8), colorObj.color);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    const labelColor = hsl(0, 0, 1);
    const subColor   = hsl(0, 0, 0.75);

    // Title and subtitle (world space, centered)
    drawText('LittleJS Tween System Example', vec2(0, 13), 1.4, labelColor);
    drawText('Press P to pause — the bottom row uses useRealTime and keeps moving',
        vec2(0, 11.5), 0.5, subColor);

    // Row labels (centered at LABEL_X, sitting just left of the animating objects)
    drawText('property',   vec2(LABEL_X, ROW_PROPERTY),  0.6, labelColor);
    drawText('callback',   vec2(LABEL_X, ROW_COUNTDOWN), 0.6, labelColor);
    drawText('chain',      vec2(LABEL_X, ROW_CHAIN),     0.6, labelColor);
    drawText('loop()',     vec2(LABEL_X, ROW_LOOP),      0.6, labelColor);
    drawText('pingPong()', vec2(LABEL_X, ROW_PINGPONG),  0.6, labelColor);
    for (let i = 0; i < easingDemos.length; i++)
    {
        const [label] = easingDemos[i];
        drawText(label, vec2(LABEL_X, ROW_EASE_TOP - i * EASE_SPACING), 0.5, labelColor);
    }
    drawText('useRealTime', vec2(LABEL_X, ROW_REALTIME), 0.6, labelColor);
    drawText('Vector2',     vec2(LABEL_X, ROW_VECTOR2),  0.6, labelColor);
    drawText('Color',       vec2(LABEL_X, ROW_COLOR),    0.6, labelColor);

    // Live countdown value sitting on the callback row, between label and the easing rows
    const countdownText = Math.ceil(countdownValue).toString();
    drawText(countdownText, vec2(0, ROW_COUNTDOWN), 1.2, hsl(0, 0.8, 0.6));

    // Pause indicator
    if (LJS.getPaused())
        drawText('PAUSED', vec2(0, -5), 2.5, hsl(0, 1, 0.7));
}

///////////////////////////////////////////////////////////////////////////////
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
