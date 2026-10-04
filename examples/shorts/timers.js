const timerSound = new Sound([2,0,999,,,,,1.5,,.3,-99,.1,1.63,,,.11]);
let timerButton, timerSlider;

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin();
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.3,.3,.2);

    // create timer button
    timerButton = new UIButton(vec2(0, -40), vec2(200, 90), 'Start');
    timerButton.timer = new Timer;
    timerButton.onClick = ()=>
    {
        timerButton.isSet = true;
        if (timerButton.timer.isSet())
        {
            timerSound.play(undefined, .5, 2);
            timerButton.timer.unset();
            timerButton.text = 'Start';
        }
        else
        {
            timerSound.play(undefined, .5, .5);
            timerButton.timer.set(3);
            timerButton.text = 'Stop';
        }
    }

    // create non-interactive slider to display timer
    timerSlider = new UISlider(vec2(0, 100), vec2(400, 50));
    timerSlider.interactive = false;
    timerSlider.onUpdate = ()=>
    {
        if (timerButton.isSet && timerButton.timer.elapsed())
        {
            timerSound.play();
            timerButton.isSet = 0;
        }

        // update the timer display
        const t = timerButton.timer.get();
        const timeText = t.toFixed(2) + 's';
        const isSet = timerButton.timer.isSet();
        const setTime = timerButton.timer.getSetTime();
        timerSlider.text = timeText;
        timerSlider.value = setTime ? 1+t/setTime : 1;
        timerSlider.color = isSet ? t < 0 ? CYAN : RED : GRAY;
    }
    timerButton.addChild(timerSlider);
}

/* info
A 3 second timer with a button and a bar. Click Start and the bar counts
down, a sound plays when the time is up, and the bar then counts how
long ago that was. Click Stop to clear the timer.

## How it works
A `Timer` remembers a moment in the engine's time and answers questions
about it. It does nothing on its own: there is no callback when it runs
out, the game asks it each frame.

- `new Timer` makes one that is not set. `new Timer(3)` would make one
  already set to 3 seconds.
- `set(3)` sets it to run out 3 seconds from now.
- `unset()` clears it.
- `isSet()` is true from `set` until `unset`, also after it has run out.
- `elapsed()` is true once it is set and its time is up. `active()` is
  the opposite, true while it is set and still running.
- `get()` is the seconds since it ran out, so it is negative while the
  timer is running: -3 at the start, 0 when it runs out, then counting
  up. It is 0 when the timer is not set.
- `getSetTime()` is the time it was set to, here 3.

A timer follows `time`, the engine's clock, which stops while the game
is paused.

### The button
The button and the bar are from the UI system plugin, started with
`new UISystemPlugin()`. UI positions and sizes are in pixels from the
middle of the canvas, with y going down.

The timer is kept on the button as `timerButton.timer`. `onClick` sets
it or unsets it, by whether it is set, and changes the button's text to
match. `timerButton.isSet` is the example's own flag, not the timer's
function of that name. It is there so the sound for running out plays
once and not on every frame after.

`timerSound.play(undefined, .5, 2)` plays the sound with no position,
at half volume and twice the pitch. The arguments are a position, a
volume and a pitch, and the same sound at a pitch of `.5` is the start
sound.

### The bar
The bar is a `UISlider` with `interactive` off, so it only shows a
value. Its `onUpdate`, which the UI calls every frame before the
slider's own update, is given a function that reads the timer:

- The text is `get()` with two decimals.
- `value` is where the handle is, from 0 to 1. `1 + t/setTime` is 0 when
  the timer starts, since `t` is `-3` then, and reaches 1 as it runs
  out. With no timer set it stays at 1.
- The color is cyan while it runs, red once it has run out and gray
  when it is not set.

`timerButton.addChild(timerSlider)` makes the bar a child of the button,
so its position, `vec2(0, 100)`, is counted from the button's center.

## Try it
- Change `set(3)` to `set(10)` for a longer timer.
- Add `timerSlider.fillMode = true;` after the line that sets
  `interactive`: the bar fills up in place of moving a handle.
- Change the pitch of the stop sound: `play(undefined, .5, 2)`
  to `play(undefined, .5, 4)`.
- Move the button and the bar with it: change `vec2(0, -40)` to
  `vec2(-200, -40)`.

## See also
Space Game and Sliding Puzzle each keep a `Timer` in a game. UI System
shows buttons and sliders, and Sound Effects how a sound is made from
numbers.
*/
