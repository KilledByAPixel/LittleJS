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

/* info
Tween features in rows: a property, a callback, a chain, loop,
pingPong, easing curves, real time, Vector2 and Color. Press P to pause;
the real time row keeps moving.

## How it works
Each row is a label and a square that a tween moves from `left` to
`right`. `addRow` makes a row as a plain object, `{label, color, size,
pos}`, each 1.2 units below the last, and `gameRender` draws them all.
`cameraScale = 24` makes a world unit 24 pixels, down from 32, so the
16 rows fit in the view.

### Property and callback
The two ways to make a tween. `tweenProperty(target, propertyPath,
start, end, duration)` sets a field of an object: here the target is
the row's `pos`, a `Vector2`, and the field is its `x`. `new
Tween(callback, start, end, duration)` hands the value to a function,
which keeps it in `countdown`. That row has a size of 0, so no square
is drawn, and `gameRender` shows the number, rounded up, in its place.

Durations are in seconds.

### then, loop and pingPong
- `.then(callback)` sets a function to call when the tween completes.
  `startChain` uses it twice: the slide's `then` starts the shrink, and
  the shrink's `then` calls `startChain` again, which puts the square
  back and starts over. A tween that repeats for ever never completes.
- `.loop()` starts the same tween again from its start value.
- `.pingPong()` swaps the start and end each time, so it goes back the
  way it came.

Both take a count, and repeat for ever without one.

### Easing
An easing curve says how far along a tween is at each moment of its
time. It can be given as the `ease` option or with `.setEase(curve)`,
as here.

- `Ease.LINEAR` is an even speed.
- `Ease.SINE`, `Ease.POWER(n)`, `Ease.BACK`, `Ease.ELASTIC` and
  `Ease.BOUNCE` are shapes. Each eases in as it is. `Ease.OUT(...)`
  turns it around to ease out, and `Ease.IN_OUT(...)` does both, the
  first half in and the second half out.
- `Ease.BEZIER(x1, y1, x2, y2)` is a curve from two control points, as
  `cubic-bezier` in CSS. These four numbers are the CSS `ease` curve.

`BACK` and `ELASTIC` go past the end value before they settle on it.

### Real time
Tweens follow the game's `time`, which stands still while the game is
paused. The option `{useRealTime: true}` has a tween follow real time
instead, for a menu or a pause screen. The key is read in
`gameUpdatePost`, since `gameUpdate` is not called while paused, and
`setPaused(!getPaused())` flips the pause.

### Vector2 and Color
A tween's start and end can be two `Vector2`s or two `Color`s. The
Vector2 row tweens the row's whole `pos`, from a point above its line
to one below. The Color row tweens the row's `color` and stays in
place.

`gameRenderPost` draws the hint with `drawTextScreen`, whose position
and size are in pixels.

## Try it
- Count down and back up: `10, 0, 5).loop()` to `10, 0, 5).pingPong()`.
- Give the loop row a count, `1.5).loop();` to `1.5).loop(3);`. After
  three passes it stops at the right.
- Change the bezier to `Ease.BEZIER(.7, 0, .3, 1)`, slow at both ends.
- Change `{useRealTime: true}` to `{}` and that row pauses too.

## See also
Tween is the short version. Timers shows `Timer`, which also has a real
time option. `tweenStopAll()` stops every tween, for a change of level.
*/
