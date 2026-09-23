// shared timing for the LittleJS bench pages: include after the engine and gpuTimer.js
// call benchInit(name, n, perFrame) in gameInit before new Render3DPlugin, and benchFrame() from gameRenderPost;
// perFrame runs once per rendered frame just before the 3D pass, which is where per frame work belongs: the fixed
// timestep runs gameUpdate several times a frame below 60 fps, so a loop there would count several times over
// after 60 warm up renders the next 300 are timed and window.benchResult is set; benchExtra adds fields to it
let benchName, benchN, benchFrames = 0, benchStart, benchFrameMs, benchRendered, benchPerFrameMs = 0, benchPhaseFrames = 0;
const benchExtra = {};
function benchInit(name, n, perFrame)
{
    benchName = name, benchN = n;
    const raf = requestAnimationFrame;
    window.requestAnimationFrame = (cb)=> raf((t)=>
    {
        benchRendered = false;
        cb(t);
        gpuTimer.end(benchRendered);
        gpuTimer.gl && gpuTimer.poll();
    });
    engineAddPlugin(undefined, undefined, undefined, undefined, ()=>
    {
        const t = performance.now();
        perFrame?.();
        if (benchStart && !benchFrameMs)
            benchPerFrameMs += performance.now() - t, ++benchPhaseFrames;
        gpuTimer.begin(glContext);
    });
}
function benchFrame()
{
    benchRendered = true;
    window.benchFrames = (window.benchFrames || 0) + 1; // for the profiler
    const now = performance.now();
    if (!benchStart)
    {
        if (++benchFrames == 60) benchStart = now, benchFrames = 0;
    }
    else if (!benchFrameMs && ++benchFrames == 300)
        benchFrameMs = (now - benchStart) / 300;
    if (benchFrameMs && !window.benchResult && (gpuTimer.done || !gpuTimer.supported))
    {
        const r = window.benchResult = { engine: benchName, n: benchN, ms: +benchFrameMs.toFixed(2), fps: +(1000 / benchFrameMs).toFixed(1),
            gpu: gpuTimer.supported ? gpuTimer.ms : 'n/a', perFrame: +(benchPerFrameMs / (benchPhaseFrames || 1)).toFixed(2), ...benchExtra };
        console.log(r.logged = `${benchName} ${benchN}: ${r.ms} ms frame, ${r.fps} fps, ${r.gpu} ms gpu`);
    }
    window.benchResult && drawTextScreen(window.benchResult.logged, vec2(mainCanvasSize.x / 2, 30), 24, BLACK, 0);
}
