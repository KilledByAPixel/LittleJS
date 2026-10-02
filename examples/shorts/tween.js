const slider = { pos: vec2(-3, 1) };
const pulser = { color: RED };
let bouncerY = 4;

function gameInit()
{
    // tween using the Tween class directly
    new Tween((y) => bouncerY = y, 4, -3, 1.5,
        { ease: Ease.OUT(Ease.BOUNCE) }).pingPong();

    // tweens using tweenProperty helper
    tweenProperty(slider, 'pos', vec2(-3, 1), vec2(3, -1), 2,
        { ease: Ease.IN_OUT(Ease.SINE) }).pingPong();

    // tween using built in color class
    tweenProperty(pulser, 'color', RED, BLUE, 1).pingPong();
}

function gameRender()
{
    drawRect(vec2(-6, bouncerY), vec2(2), GREEN);
    drawRect(slider.pos,         vec2(2), CYAN);
    drawRect(vec2(6, 0),         vec2(2), pulser.color);
}

/* info
Three squares, each moved by a tween: one drops and bounces, one slides
back and forth, and one changes color. There is nothing to press.

## How it works
A tween takes a value from a start to an end over a number of seconds.
It is set up once, and the tween system then moves it along on every
update. Nothing in this example has a `gameUpdate`.

### A Tween with a callback
`new Tween(callback, start, end, duration, options)` calls the callback
with the value as it goes. Here the callback stores it in `bouncerY`,
which goes from 4 to -3 in 1.5 seconds. The callback is also called
once as the tween is made, with the start value.

The `ease` option is the curve the value follows. Without one it is
`Ease.LINEAR`, an even speed. The named curves, like `Ease.BOUNCE` and
`Ease.SINE`, all ease in: their effect is at the start. `Ease.OUT(...)`
turns a curve around so its effect is at the end, which for a bounce is
a fall that hits the ground. `Ease.IN_OUT(...)` uses the curve at both
ends.

### tweenProperty
`tweenProperty(target, propertyPath, start, end, duration, options)` is
the short way to tween a field of an object: it makes the same `Tween`
with a callback that sets `target[propertyPath]`. The path is a string,
and may have dots in it, like `'pos.x'`.

The start and end can be numbers, `Vector2`s or `Color`s, both of the
same type. `slider.pos` moves between two points, along x and y at
once, and `pulser.color` blends from `RED` to `BLUE`. `slider` and
`pulser` are plain objects made for this example. The target can as
well be an `EngineObject`.

### pingPong
A tween ends when it reaches its end value. `.pingPong()` has it swap
its start and end and go again, for ever, or the number of times given.
The curve is not mirrored on the way back: the green square eases out
with a bounce going down, and does the same going up, bouncing against
the top. `.loop()` starts over from the start value instead.

### gameRender
The squares are drawn with `drawRect(pos, size, color)` from the three
values the tweens keep changing.

Tweens follow game time, so they stop while the game is paused.

## Try it
- Change `Ease.BOUNCE` to `Ease.ELASTIC` or `Ease.BACK`.
- Slow the green square down: `4, -3, 1.5,` to `4, -3, 3,`.
- Change `Ease.IN_OUT(Ease.SINE)` to `Ease.LINEAR` and the middle
  square no longer slows at each end.
- Change the color tween's `.pingPong()` to `.loop()`: it jumps from
  blue back to red.

## See also
Tween Advanced has chains with `then`, eight easing curves in rows and
tweens that keep going while paused. Timers shows `Timer`, for when
something should happen after a time.
*/
