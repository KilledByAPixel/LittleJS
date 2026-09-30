// every tween feature in rows: a property, a callback, a chain, loop,
// pingPong, easing curves, real time, Vector2 and Color; press P to
// pause, the real time row keeps moving

const rows = [], left = -6, right = 8;
let countdown = 10;

// a row: a label and a square the tween moves along it
function addRow(label, color, size=.8)
{
    const y = 8 - rows.length * 1.2;
    const row = {label, color, size, pos: vec2(left, y)};
    rows.push(row);
    return row;
}

function gameInit()
{
    cameraScale = 24;

    // a property tween, back and forth forever
    const property = addRow('property', hsl(.6,.8,.6));
    tweenProperty(property.pos, 'x', left, right, 2).pingPong();

    // a callback tween, counting 10 down to 0 over and over
    addRow('callback', hsl(0,.8,.6), 0);
    new Tween((v)=> countdown = v, 10, 0, 5).loop();

    // a chain: slide right, then shrink, then start again
    const chain = addRow('then', hsl(.05,.8,.6));
    const startChain = ()=>
    {
        chain.pos.x = left, chain.size = .8;
        tweenProperty(chain.pos, 'x', left, right, 1.5).then(()=>
            tweenProperty(chain, 'size', .8, .2, .8).then(startChain));
    };
    startChain();

    // loop starts over, pingPong turns back
    const loop = addRow('loop', hsl(.3,.8,.6));
    tweenProperty(loop.pos, 'x', left, right, 1.5).loop();
    const pingPong = addRow('pingPong', hsl(.5,.8,.6));
    tweenProperty(pingPong.pos, 'x', left, right, 1.5).pingPong();

    // the easing curves, each row the same move with a different ease
    const eases = [
        ['LINEAR', Ease.LINEAR],
        ['OUT(SINE)', Ease.OUT(Ease.SINE)],
        ['OUT(POWER(2))', Ease.OUT(Ease.POWER(2))],
        ['OUT(BACK)', Ease.OUT(Ease.BACK)],
        ['OUT(ELASTIC)', Ease.OUT(Ease.ELASTIC)],
        ['OUT(BOUNCE)', Ease.OUT(Ease.BOUNCE)],
        ['IN_OUT(POWER(3))', Ease.IN_OUT(Ease.POWER(3))],
        ['BEZIER', Ease.BEZIER(.25, .1, .25, 1)],
    ];
    eases.forEach(([label, ease], i)=>
    {
        const row = addRow(label, hsl(i/eases.length,.8,.6), .6);
        tweenProperty(row.pos, 'x', left, right, 2)
            .setEase(ease).pingPong();
    });

    // real time keeps going while the game is paused
    const real = addRow('useRealTime', hsl(.85,.8,.6));
    tweenProperty(real.pos, 'x', left, right, 2, {useRealTime: true})
        .pingPong();

    // a Vector2 moves along both axes, a Color blends with Color.lerp
    const diagonal = addRow('Vector2', hsl(.15,.8,.6));
    const y = diagonal.pos.y;
    tweenProperty(diagonal, 'pos', vec2(left, y+.4), vec2(right, y-.4), 2)
        .pingPong();
    const blend = addRow('Color', hsl(0,.8,.6));
    blend.pos.x = (left + right) / 2;
    tweenProperty(blend, 'color', hsl(0,.8,.6), hsl(.6,.8,.6), 2)
        .pingPong();
}

function gameUpdatePost()
{
    if (keyWasPressed('KeyP'))
        setPaused(!getPaused());
}

function gameRender()
{
    for (const row of rows)
    {
        drawText(row.label, vec2(-12, row.pos.y), .5, WHITE);
        row.size && drawRect(row.pos, vec2(row.size), row.color);
    }
    const callback = rows[1];
    drawText(Math.ceil(countdown) + '', vec2(1, callback.pos.y), 1,
        callback.color);
    if (getPaused())
        drawText('PAUSED', vec2(1, -3), 2, hsl(0,1,.7));
}

function gameRenderPost()
{
    drawTextScreen('Press P to pause, useRealTime keeps moving',
        vec2(mainCanvasSize.x/2, 30), 24);
}
