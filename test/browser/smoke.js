// shared by the browser smoke pages: checks, pixels read from the WebGL canvas, and the result the runner reads
'use strict';

const smokeChecks = [];

// note a check, with what was seen
function check(name, ok, detail) { smokeChecks.push({name, ok: !!ok, detail}); }

// errors and failed asserts fail the page
addEventListener('error', (e)=> check('no error', false, e.message));
addEventListener('unhandledrejection', (e)=> check('no error', false, String(e.reason?.message || e.reason)));
{
    const assert = console.assert;
    console.assert = function(condition, ...output)
    {
        condition || check('no failed assert', false, output.map(String).join(' '));
        assert.apply(this, arguments);
    };
}

// the color drawn at a place on the WebGL canvas, x and y from 0 to 1 across it, y up, as [r, g, b, a] in 0 to 255
function smokePixel(x, y)
{
    const gl = glContext, pixel = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(x * gl.drawingBufferWidth | 0, y * gl.drawingBufferHeight | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
}

// is a pixel near a color, each channel within a tolerance
const smokeNear = (pixel, color, tolerance=24)=> color.every((c, i)=> Math.abs(pixel[i] - c) <= tolerance);

// check the color at a place
function checkPixel(name, x, y, color, tolerance)
{
    const pixel = smokePixel(x, y);
    check(name, smokeNear(pixel, color, tolerance), pixel);
}

// no WebGL error since the last check
function checkGLError(name='no WebGL error') { const error = glContext.getError(); check(name, !error, error); }

// a sheet of 16 pixel tiles in a row, one plain color each, as a data url to hand engineInit as its image
function smokeSheet(...colors)
{
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    canvas.width = 16 * colors.length, canvas.height = 16;
    colors.forEach((color, i)=> { context.fillStyle = color; context.fillRect(i * 16, 0, 16, 16); });
    return canvas.toDataURL();
}

// write the result for the runner; a page opened with ?post sends it to its server too, for a browser that is
// not driven through DevTools, Firefox
function smokeDone()
{
    const result = JSON.stringify({checks: smokeChecks});
    document.getElementById('result').textContent = result;
    location.search.includes('post') && fetch('/smoke-result', {method: 'POST', body: result});
}

// run a page's checks, anything thrown is a failed check
async function smokeRun(run)
{
    try { await run(); }
    catch (e) { check('ran to the end', false, String(e?.stack || e)); }
    smokeDone();
}
