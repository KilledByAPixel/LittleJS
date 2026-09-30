// every built-in particle effect at scale 1, each fitting a one unit
// box; click one to play it again, keys 1 to 3 set the scale, H turns
// the hue, S takes the color out

let scale = 1, hue = 0, saturation = 1, playing = [];

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
    playing[i] = particleEffect(particleEffectsBuiltIn[i], cellPos(i),
        {scale, hue, saturation});
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
    if (mouseWasPressed(0))
        particleEffectsBuiltIn.forEach((name, i)=>
            mousePos.distance(cellPos(i)) < 1.5 && play(i));
}

function gameRender()
{
    particleEffectsBuiltIn.forEach((name, i)=>
    {
        drawRect(cellPos(i), vec2(1), hsl(0,0,1,.08));
        drawText(name, cellPos(i).add(vec2(0, -1.4)), .4, hsl(0,0,.8));
    });
}
