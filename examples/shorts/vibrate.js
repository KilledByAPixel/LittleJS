function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.05,.5,.2);

    // create buttons to demo vibrate() and gamepadVibrate()
    const w = 320, h = 80, gap = 20;
    function makeButton(pos, text, onClick)
    {
        pos = pos.multiply(vec2(w+gap, h+gap));
        const button = new UIButton(pos, vec2(w, h), text);
        button.onClick = onClick;
    }

    // device vibration - single pulse (works on most mobile devices)
    makeButton(vec2(0,-2), 'Device: 200ms', ()=> vibrate(200));

    // device vibration - pattern of pulses and pauses
    makeButton(vec2(0,-1), 'Device: Pattern',
        ()=> vibrate([100,50,100,50,300]));

    // gamepad rumble - dual motor (requires connected gamepad)
    makeButton(vec2(-1,0), 'Gamepad: Strong',
        ()=> gamepadVibrate(0, 400, 1, 0));
    makeButton(vec2( 1,0), 'Gamepad: Weak',
        ()=> gamepadVibrate(0, 400, 0, 1));
    makeButton(vec2(0, 1), 'Gamepad: Both',
        ()=> gamepadVibrate(0, 400, 1, 1));

    // stop all vibration
    makeButton(vec2(0, 2), 'Stop', ()=>
    {
        vibrateStop();
        gamepadVibrateStop(0);
    });
}

/* info
Six buttons that make things shake: two vibrate the device, as a phone
can, three rumble a gamepad, and the last stops everything. Click or
tap a button. Nothing happens where there is no hardware for it, so the
device buttons need a phone and the gamepad ones a connected gamepad
that can rumble.

## How it works
### The buttons
The buttons come from the UI system plugin. `new UISystemPlugin` sets it
up and makes the global `uiSystem`, whose `default` settings are copied
by every UI object made after: here round corners and a black shadow.

`makeButton` is the example's own helper. A `UIButton(pos, size, text)`
has its position and size in pixels, not world units, and the position
is its center, counted from the middle of the canvas with y going down.
The helper takes a position in whole buttons and multiplies it by a
button's width and height plus the gap, so `vec2(0,-2)` is the top
button and `vec2(-1,0)` and `vec2(1,0)` sit side by side. The function
given as `onClick` is called when the button is clicked.

### Device vibration
- `vibrate(200)` vibrates the device for 200 milliseconds.
- `vibrate([100,50,100,50,300])` takes a pattern: the numbers are, in
  turn, how long to vibrate and how long to pause.
- `vibrateStop()` ends a vibration that is still going.

### Gamepad rumble
`gamepadVibrate(gamepad, duration, strongMagnitude, weakMagnitude)`
takes the number of the gamepad, here 0, a time in milliseconds, and
how hard to run each of the two motors, from 0 to 1. The strong motor is
usually the left one and the weak motor the right. The three buttons run
one, the other, and both. `gamepadVibrateStop(0)` stops gamepad 0.

## Try it
- Change `vibrate(200)` to `vibrate(1000)` for a full second.
- Write a pattern of your own in place of `[100,50,100,50,300]`, like
  `[50,50,50,50,50,50,400]`.
- Make the last rumble longer and softer: change
  `gamepadVibrate(0, 400, 1, 1)` to `gamepadVibrate(0, 2000, .3, .3)`.
- Set `defaultCornerRadius` to `40` for rounder buttons.

## See also
Input shows a gamepad's sticks and buttons, and UI System the other
things the UI plugin has. `vibrateEnable` is the setting that turns all
vibration off.
*/
