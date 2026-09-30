// every built-in particle effect at scale 1, each fitting a one unit
// box; the one-shots play again every few seconds and the trail moves
// so it can be seen; click one to play it now, keys 1 to 3 set the
// scale, H turns the hue, S takes the color out

let scale = 1, hue = 0, saturation = 1, playing = [], replayTimes = [];

// the effects in a grid of 8 by 3, 3 units apart
const cellPos = (i)=> vec2((i % 8 - 3.5) * 3, 3 - (i / 8 | 0) * 4);

function gameInit()
{
    cameraScale = 40;
    canvasClearColor = hsl(.6,.2,.12);
    playAll();
}

function play(i)
{
    playing[i]?.destroy();
    const name = particleEffectsBuiltIn[i];
    const s = particleEffectsGet(name).settings;
    playing[i] = particleEffect(name, cellPos(i), {scale, hue, saturation});

    // a one-shot plays again once its last particle is gone, 2 seconds on
    // at least; its particles live up to particleTime and randomness more
    const life = s.emitTime + s.particleTime * (1 + s.randomness);
    replayTimes[i] = s.emitTime ? time + max(2, life) : Infinity;
}

function playAll()
{
    particleEffectsBuiltIn.forEach((name, i)=> play(i));
}

function gameUpdate()
{
    for (const k of [1, 2, 3])
        if (keyWasPressed('Digit' + k)) scale = k, playAll();
    if (keyWasPressed('KeyH')) hue = (hue + .25) % 1, playAll();
    if (keyWasPressed('KeyS')) saturation = saturation ? 0 : 1, playAll();
    particleEffectsBuiltIn.forEach((name, i)=>
    {
        if (mouseWasPressed(0) && mousePos.distance(cellPos(i)) < 1.5 ||
            time > replayTimes[i])
            play(i);
    });

    // a trail only shows when it moves, this one circles its cell
    const trail = particleEffectsBuiltIn.indexOf('trail');
    playing[trail].pos = cellPos(trail).add(
        vec2(cos(time*4), sin(time*4)).scale(.8));
}

function gameRender()
{
    particleEffectsBuiltIn.forEach((name, i)=>
    {
        drawRect(cellPos(i), vec2(1), hsl(0,0,1,.08));
        drawText(name, cellPos(i).add(vec2(0, -1.4)), .4, hsl(0,0,.8));
    });
}
