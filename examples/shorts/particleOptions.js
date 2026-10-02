let cells;
const replay = new Timer;

// 4 cells across and 2 down, 5 units apart
const cellPos = (i)=> vec2((i % 4 - 1.5) * 5, i < 4 ? 1.5 : -4);

function gameInit()
{
    cameraScale = 45;
    canvasClearColor = hsl(.6,.2,.12);

    // the options for each cell, and what it says under the fire
    cells =
    [
        [{}, 'as it is'],
        [{scale: 2}, '{scale: 2}'],
        [{hue: .6}, '{hue: .6}'],
        [{saturation: 0}, '{saturation: 0}'],
        [{emitSize: 2}, '{emitSize: 2}'],
        [{tileInfo: tile(6)}, '{tileInfo: tile(6)}'],
        [{emitTime: .3}, '{emitTime: .3}'],
        [{speed: .1, particleTime: .4}, '{speed: .1, particleTime: .4}'],
    ];
    cells.forEach(([options], i)=>
        particleEffect('fire', cellPos(i), options));
    replay.set(2);
}

function gameUpdate()
{
    // the burst ends itself, so it plays again every 2 seconds
    if (replay.elapsed())
    {
        particleEffect('fire', cellPos(6), cells[6][0]);
        replay.set(2);
    }
}

function gameRender()
{
    cells.forEach(([, text], i)=>
    {
        drawRect(cellPos(i), vec2(1, .2), hsl(0,0,1,.1));
        drawText(text, cellPos(i).add(vec2(0, -1)), .45, hsl(0,0,.85));
    });
    drawText("particleEffect('fire', pos, options)", vec2(0, 5.2), .6,
        hsl(.1,.8,.7));
}

/* info
One built-in effect, fire, with one option changed in each cell and the
line that does it under it. Any effect setting can go in the options
too, like `emitTime` for a burst or `speed`. The Particle Effects short
shows every built-in effect.
*/
