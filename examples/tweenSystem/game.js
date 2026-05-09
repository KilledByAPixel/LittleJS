/*
    LittleJS Tween System Example
    - Demonstrates every public feature of the tween plugin
    - 1) Property tween, 2) Callback tween, 3) Chaining, 4) Loop+PingPong,
      5) Easing showcase, 6) Real-time tween that survives pause
*/

'use strict';

import * as LJS from '../../dist/littlejs.esm.js';
const { vec2, hsl, tile, drawRect, drawTextScreen, mainCanvasSize } = LJS;
const { Tween, tweenProperty, Ease } = LJS;

LJS.setCanvasFixedSize(vec2(1920, 1080));
LJS.setCanvasPixelated(false);

///////////////////////////////////////////////////////////////////////////////
// State for each demo

// 1) Basic property tween: a moving sprite
const moverObj = { pos: vec2(-5, 6) };

// 2) Callback tween: countdown text. Updated by a tween that ticks the value.
let countdownValue = 10;
let countdownTween;

// 3) Chaining: object that fades after sliding
const chainObj = { pos: vec2(-5, 3), size: 1 };
let chainTween;

// 4) Loop + PingPong: two adjacent objects
const loopObj = { pos: vec2(-5, 0) };
const pingPongObj = { pos: vec2(-5, -2) };

// 5) Easing showcase: one row per curve
const easingDemos =
[
    ['LINEAR',   Ease.LINEAR],
    ['SINE',     Ease.OUT(Ease.SINE)],
    ['POWER(2)', Ease.OUT(Ease.POWER(2))],
    ['BACK',     Ease.OUT(Ease.BACK)],
    ['ELASTIC',  Ease.OUT(Ease.ELASTIC)],
    ['BOUNCE',   Ease.BOUNCE],
];
const easingObjs = easingDemos.map((_, i) => ({ pos: vec2(-7, -4 - i * 0.7) }));

// 6) Real-time tween: keeps moving even while game is paused
const realObj = { pos: vec2(-5, -10) };

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    LJS.setCanvasClearColor(hsl(0, 0, 0.1));

    // 1) Basic property tween over 2 seconds, looping forever
    tweenProperty(moverObj.pos, 'x', -5, 5, 2).pingPong();

    // 2) Callback tween: ticks countdownValue from 10 → 0 over 5 seconds, then fires "BOOM!"
    countdownTween = new Tween((v) => { countdownValue = v; }, 10, 0, 5)
        .setEase(Ease.LINEAR)
        .then(() => { countdownValue = -1; }); // sentinel for "BOOM!"

    // 3) Chaining: slide right, then on completion shrink to zero size
    chainTween = new Tween((v) => { chainObj.pos.x = v; }, -5, 5, 2)
        .then(() =>
        {
            new Tween((v) => { chainObj.size = v; }, 1, 0, 1);
        });

    // 4) Loop and PingPong on adjacent rows
    tweenProperty(loopObj.pos, 'x', -5, 5, 1.5).loop(5);
    tweenProperty(pingPongObj.pos, 'x', -5, 5, 1.5).pingPong();

    // 5) Easing showcase: each row gets its own ease, all loop forever
    for (let i = 0; i < easingDemos.length; i++)
    {
        const [, easeFn] = easingDemos[i];
        tweenProperty(easingObjs[i].pos, 'x', -7, 7, 2)
            .setEase(easeFn)
            .pingPong();
    }

    // 6) Real-time tween: keeps animating while game is paused
    tweenProperty(realObj.pos, 'x', -5, 5, 2, { realTime: true }).pingPong();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate() { }

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // Press P to toggle game pause; the realTime tween keeps moving regardless.
    if (LJS.keyWasPressed('KeyP')) LJS.setPaused(!LJS.getPaused());
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // 1) mover
    drawRect(moverObj.pos, vec2(0.8), hsl(0.6, 0.8, 0.6));

    // 3) chain target
    drawRect(chainObj.pos, vec2(chainObj.size), hsl(0.05, 0.8, 0.6));

    // 4) loop + pingPong
    drawRect(loopObj.pos, vec2(0.8), hsl(0.3, 0.8, 0.6));
    drawRect(pingPongObj.pos, vec2(0.8), hsl(0.5, 0.8, 0.6));

    // 5) easing showcase
    for (let i = 0; i < easingObjs.length; i++)
        drawRect(easingObjs[i].pos, vec2(0.6), hsl(i / easingObjs.length, 0.8, 0.6));

    // 6) real-time
    drawRect(realObj.pos, vec2(0.8), hsl(0.85, 0.8, 0.6));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    const cx = mainCanvasSize.x / 2;

    // Title
    drawTextScreen('LittleJS Tween System Example',
        vec2(cx, 60), 60, hsl(0, 0, 1));
    drawTextScreen('Press P to toggle pause — the bottom tween (real-time) keeps moving',
        vec2(cx, 110), 28, hsl(0, 0, 0.85));

    // 2) countdown text
    const ct = countdownValue < 0 ? 'BOOM!' : Math.ceil(countdownValue).toString();
    drawTextScreen(ct, vec2(cx, mainCanvasSize.y * 0.18), 100, hsl(0.0, 0.8, 0.6));

    // Easing labels
    for (let i = 0; i < easingDemos.length; i++)
    {
        const [label] = easingDemos[i];
        const screen = LJS.worldToScreen(vec2(-9, -4 - i * 0.7));
        drawTextScreen(label, screen, 28, hsl(0, 0, 1));
    }

    // Pause indicator
    if (LJS.getPaused())
        drawTextScreen('PAUSED', vec2(cx, mainCanvasSize.y * 0.5), 80, hsl(0, 1, 0.6));
}

///////////////////////////////////////////////////////////////////////////////
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
