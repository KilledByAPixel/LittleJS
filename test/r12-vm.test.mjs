import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// review round 12: the light system's shadow pass draws the world with its own camera, so a screen space
// WebGL draw in a render() would land somewhere in the world; the engine skips them while the pass runs

test('screen space WebGL draws are skipped while glSkipScreenSpace is set, world space draws are not', () =>
{
    const { run } = loadEngine();
    const counts = run(`
        glEnable = true; glContext = new Proxy({}, { get: ()=> ()=> {} });
        let draws = 0;
        glDraw = glDrawUntextured = glDrawOutlineTransform = glDrawPointsTransform = glDrawColoredPoints = ()=> ++draws;
        glSetTexture = ()=> {};
        const drawAll = (screenSpace)=>
        {
            drawRect(vec2(1), vec2(1), WHITE, 0, true, screenSpace);
            drawRectGradient(vec2(1), vec2(1), WHITE, BLACK, 0, true, screenSpace);
            drawLineList([vec2(), vec2(1)], .1, WHITE, false, vec2(), 0, true, screenSpace);
            drawPoly([vec2(), vec2(1), vec2(1, 0)], WHITE, 0, BLACK, vec2(), 0, true, screenSpace);
            drawEllipse(vec2(1), vec2(1), WHITE, 0, 0, BLACK, true, screenSpace);
        };
        const result = [];
        drawAll(true); result.push(draws); draws = 0;
        glSkipScreenSpace = true;
        drawAll(true); result.push(draws); draws = 0;
        drawAll(false); result.push(draws); draws = 0;
        glSkipScreenSpace = false;
        result;
    `);
    assert.ok(counts[0] >= 5, 'every screen space draw goes through normally');
    assert.equal(counts[1], 0, 'none while the flag is set');
    assert.equal(counts[2], counts[0], 'world space draws still go through');
});
