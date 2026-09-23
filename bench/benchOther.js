// shared timing for the bench pages of other engines, three.js, PixiJS and Phaser: include after gpuTimer.js
// benchRun(name, n, gl, update, render) runs the animation loop: update() is the JS work of the frame, render()
// the draw; an engine that runs its own loop calls gpuTimer.begin(gl) before its draw, gpuTimer.end() after, then
// benchTick(name, n) once per frame; after 60 warm up frames the next 300 are timed and window.benchResult is set,
// and benchExtra adds fields to it
const benchExtra = {};
let benchFrames = 0, benchStartTime, benchFrameMs, benchResult, benchUpdateMs = 0, benchPhaseFrames = 0, benchLabel;
function benchTick(name, n)
{
    if (!benchLabel)
    {
        benchLabel = document.createElement('div');
        benchLabel.style.cssText = 'position:fixed;top:14px;width:100%;text-align:center;color:#000;font:24px sans-serif';
        document.body.appendChild(benchLabel);
    }
    gpuTimer.gl && gpuTimer.poll();
    window.benchFrames = (window.benchFrames || 0) + 1; // for the profiler
    const now = performance.now();
    if (!benchStartTime)
    {
        if (++benchFrames == 60) benchStartTime = now, benchFrames = 0;
    }
    else if (!benchFrameMs && ++benchFrames == 300)
        benchFrameMs = (now - benchStartTime) / 300;
    if (benchFrameMs && !benchResult && (gpuTimer.done || !gpuTimer.supported))
    {
        benchResult = window.benchResult = { engine: name, n, ms: +benchFrameMs.toFixed(2), fps: +(1000 / benchFrameMs).toFixed(1),
            gpu: gpuTimer.supported ? gpuTimer.ms : 'n/a', perFrame: +(benchUpdateMs / (benchPhaseFrames || 1)).toFixed(2), ...benchExtra };
        benchLabel.textContent = benchResult.logged = `${name} ${n}: ${benchResult.ms} ms frame, ${benchResult.fps} fps, ${benchResult.gpu} ms gpu`;
        console.log(benchResult.logged);
    }
}
function benchRun(name, n, gl, update, render)
{
    function frame()
    {
        requestAnimationFrame(frame);
        const t = performance.now();
        update();
        if (benchStartTime && !benchFrameMs)
            benchUpdateMs += performance.now() - t, ++benchPhaseFrames;
        gpuTimer.begin(gl);
        render();
        gpuTimer.end();
        benchTick(name, n);
    }
    frame();
}
// the engine's fixed 60 Hz timestep: how many simulation steps this frame gets, at most 3 like LittleJS's catch up cap
let benchLastTime = 0, benchTimeBuffer = 0;
function benchSteps()
{
    const now = performance.now();
    benchTimeBuffer += benchLastTime ? now - benchLastTime : 1000 / 60;
    benchLastTime = now;
    benchTimeBuffer = Math.min(benchTimeBuffer, 50);
    let steps = 0;
    for (; benchTimeBuffer >= 1000 / 60 - 1e-6; benchTimeBuffer -= 1000 / 60) ++steps;
    return steps;
}
// a 32 pixel soft dot like render3DSoftDot, for particles
function benchSoftDot()
{
    const size = 32, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]])
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return canvas;
}
