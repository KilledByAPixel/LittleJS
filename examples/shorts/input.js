function gameInit()
{
    // show the touch gamepad, and let touches outside it move the mouse
    touchGamepadEnable = touchGamepadPassthrough = true;
}

function gameUpdate()
{
    if (isTouchDevice || isUsingGamepad)
    {
        if (isTouchDevice)
        {
            debugText('Touch Gamepad Mode', vec2(0,5));

            // a touch outside the gamepad is the mouse
            debugPoint(mousePos, mouseIsDown(0) ? RED : YELLOW, 1);
        }
        else
        {
            debugText('Gamepad Mode', vec2(0,5));
            debugText('Primary Gamepad: ' + gamepadPrimary, vec2(0,4));
        }

        // analog sticks
        for (let i=2; i--;)
        {
            const stick = gamepadStick(i);
            const pos = vec2(i?3:-3, 1);
            debugCircle(pos, 4, WHITE);
            debugLine(pos, pos.add(stick.scale(2)), GREEN);
        }

        // buttons
        for (let i=16; i--;)
        {
            const pos = vec2(-7 + i%8*2, -3 - (i/8|0)*2);
            if (gamepadIsDown(i))
                debugCircle(pos, 2, RED, 0, 1);
            debugCircle(pos, 2, WHITE);
            debugText(i, pos);
        }
    }
    else
    {
        debugText('Mouse and Keyboard Mode', vec2(0,5));

        // keyboard key (space bar)
        debugRect(vec2(), vec2(4), WHITE);
        if (keyIsDown('Space'))
            debugRect(vec2(), vec2(4), RED, 0, 0, 1);

        // keyboard direction (arrow keys or WASD)
        const inputDirection = keyDirection();
        debugLine(vec2(), inputDirection.scale(2), GREEN);

        // mouse pos
        debugPoint(mousePos, mouseIsDown(0) ? RED : YELLOW, 1);

        // mouse buttons
        for (let i=3; i--;)
        {
            const pos = vec2(-2 + i*2, -5);
            if (mouseIsDown(i))
                debugCircle(pos, 2, RED, 0, 1);
            debugCircle(pos, 2, WHITE);
            debugText(i, pos);
        }
    }
}

/* info
Shows what the engine reads from the keyboard, the mouse and a gamepad.
With a mouse and keyboard: hold Space, hold the arrow keys or WASD, move
the mouse and press its buttons. Press a button on a gamepad and the
view changes to its two sticks and sixteen buttons. A touch device gets
the gamepad view too, for the engine's on screen gamepad, and a point
that follows a touch outside it.

## How it works
`gameInit` turns on the touch gamepad, and all the rest is in
`gameUpdate`, which runs 60 times a second. Input in LittleJS is asked
for, not handed over in events: each function below says how things
are on this frame.

The drawing is done with the debug functions, `debugRect`,
`debugCircle`, `debugLine`, `debugPoint` and `debugText`. They are drawn
over everything and can be called from anywhere, an update included,
which is what makes them handy for showing state. They only draw in the
debug build of the engine, so a game uses the `draw` functions for
anything it means to ship.

### Which device
`isUsingGamepad` is true while a gamepad is the device used last, and
`isTouchDevice` is true on a device with a touch screen. Setting
`touchGamepadEnable` turns on the on screen gamepad for touch devices,
which is then read with the same gamepad functions. While it is on,
touches no longer move the mouse, unless `touchGamepadPassthrough` is
set too: then a touch outside the gamepad's controls is the mouse, as
it is with no gamepad showing.

### Gamepad
- `gamepadStick(i)` returns stick `i` as a vector, y up, its length from
  0 to 1. The line is drawn at twice that, so a stick pushed all the way
  reaches the edge of its circle, which is 4 units across.
- `gamepadIsDown(i)` is true while button `i` is held. The loop lays the
  sixteen buttons out in two rows of eight and fills the ones held.
- `gamepadPrimary` is the number of the gamepad these functions read
  when they are not given one.

### Keyboard and mouse
- `keyIsDown('Space')` is true while the key is held. Keys are named by
  their code, like `'Space'`, `'KeyW'` or `'ArrowUp'`.
- `keyDirection()` returns a vector from the arrow keys: x is -1, 0 or 1
  for left and right, and y the same for down and up. The WASD keys
  count as arrows unless `inputWASDEmulateDirection` is turned off.
- `mousePos` is the mouse in world units.
- `mouseIsDown(i)` is true while a mouse button is held: 0 is the left
  button, 1 the middle and 2 the right.

The last arguments of the debug calls differ from one to the next. The
`1` that ends `debugPoint` is a time: the point stays for one second, so
the mouse leaves a trail. The `1` that ends the filled `debugCircle` and
`debugRect` calls is the `fill` argument. Their time is `0`, which
means this frame only, so they have to be drawn again every update.

## Try it
- Read another key: change `'Space'` to `'KeyF'`.
- Give `keyDirection` keys of its own, in the order up, down, left,
  right: `keyDirection('KeyI','KeyK','KeyJ','KeyL')`.
- Change `inputDirection.scale(2)` to `inputDirection.scale(4)` for a
  longer line.
- Change `mouseIsDown(i)` to `mouseWasPressed(i)`, which is true only on
  the frame a button goes down. The circles flash.

## See also
Vibrate makes a gamepad rumble and Camera Mouse Drag uses the mouse's
movement and its wheel. Platformer Game and Top Down Game move a player
with `keyDirection`. Debug Drawing shows the debug functions.
*/
