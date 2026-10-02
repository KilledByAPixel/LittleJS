// values the tweakables panel changes live, change one and see it at once
let ballSize = 1;
let ballBounce = .8;
let ballColor = hsl(.55, .8, .6);
let wind = vec2();
let showTrails = true;

const bounceSound = new Sound([,.2,300,,,.05,,2]);

class Ball extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(ballSize));
        this.velocity = randInCircle(.3);
        this.trail = [];
    }

    update()
    {
        // read the tweaks every frame, so a change shows at once
        this.size = vec2(ballSize);
        this.color = ballColor;
        this.velocity = this.velocity.add(wind);

        // bounce off the edges of the screen
        const edge = getCameraSize().subtract(this.size).scale(.5);
        if (abs(this.pos.x) > edge.x)
        {
            this.pos.x = clamp(this.pos.x, -edge.x, edge.x);
            this.velocity.x *= -ballBounce;
        }
        if (this.pos.y < -edge.y)
        {
            const speed = -this.velocity.y;
            speed > .2 && bounceSound.play(this.pos, speed);
            this.pos.y = -edge.y;
            this.velocity.y = speed * ballBounce;
        }

        // keep the last few places it was for its trail
        this.trail.unshift(this.pos.copy());
        this.trail.length = min(this.trail.length, 20);
    }

    render()
    {
        if (showTrails)
        for (let i = this.trail.length; i--;)
        {
            const p = 1 - i / this.trail.length;
            const color = this.color.scale(1, p * .3);
            drawCircle(this.trail[i], this.size.x * p, color);
        }
        drawCircle(this.pos, this.size.x, this.color);
    }
}

function gameInit()
{
    setGravity(vec2(0, -.01));
    canvasClearColor = hsl(.6, .5, .15);
    for (let i = 20; i--;)
        new Ball(randInCircle(8));

    // show the panel from the start, 9 toggles it while the debug
    // overlay is open, and it is never shown in a release build
    debugTweakables = true;

    // add the values to the panel, a min and max give a slider
    tweakDivider('Balls');
    tweak('ballSize', {min: .2, max: 3});
    tweak('ballBounce', {min: 0, max: 1.2});
    tweak('ballColor');
    tweak('wind', {min: -.005, max: .005});
    tweak('showTrails', {label: 'Trails'});
    tweakDivider('Scene');
    tweak('canvasClearColor', {label: 'Sky Color'});
    tweakButton('Clear Balls', ()=> engineObjectsDestroy());

    // gravity, time scale, camera scale and sound volume
    tweakEngineDefaults();
}

function gameUpdate()
{
    if (mouseWasPressed(0))
        new Ball(mousePos);
}

function gameRenderPost()
{
    drawTextScreen('Click to add balls\nCopy puts changes on the clipboard',
        vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
Twenty balls bounce around the screen, and a panel in the corner changes
them while they move: their size, bounce, color, a wind, their trails
and the sky. Click to add a ball. This is the tweakables plugin, a debug
tool for tuning a game's numbers without reloading it.

## How it works
### Values to tweak
The file starts with five ordinary global variables: a number for the
size, one for the bounce, a `Color`, a `Vector2` for the wind and a
boolean. They are declared with `let`, since a `const` can not be
changed.

A tweak only changes the variable. The game has to read it, so
`Ball.update` copies `ballSize` and `ballColor` onto each ball every
frame, and adds `wind` to its velocity. A value read once, when an
object is made, would not follow the panel.

### The panel
The calls at the end of `gameInit` fill the panel, in order:

- `tweak('ballSize', {min: .2, max: 3})` adds the global of that name.
  The name is a string, and the kind of control comes from the value it
  has now. A number with both `min` and `max` gets a slider and a box to
  type in. With no range it gets only the box.
- `tweak('ballColor')` finds a `Color` and adds a color picker with a
  slider for its alpha.
- `tweak('wind', ...)` finds a `Vector2` and adds a number for x and one
  for y, each with the range given.
- `tweak('showTrails', {label: 'Trails'})` finds a boolean and adds a
  checkbox. `label` is the name shown in place of the variable's.
- `tweak('canvasClearColor', ...)` shows that the engine's own globals
  can be tweaked the same way.
- `tweakDivider('Balls')` adds a heading, and `tweakButton(label, fn)` a
  button that calls a function. This one calls `engineObjectsDestroy`,
  which destroys every object.
- `tweakEngineDefaults()` adds gravity, time scale, camera scale and
  sound volume under an Engine heading.

`tweak` is called after the value is set, which is why the calls come
last in `gameInit`.

`debugTweakables = true` shows the panel from the start. Left out, the
panel opens with the 9 key while the debug overlay is open, and Escape
opens the overlay.

### Keeping the changes
A changed value is saved in the browser and comes back after a reload,
until the value in the code itself is changed. The panel's Copy button
puts the changed values on the clipboard as lines of code, like
`ballSize = 2;`, to paste over the ones in the file. Reset puts every
value back to the one in the code.

All of this is in debug builds only. In a release build the `tweak`
functions do nothing and the code's values are used as they are.

### The balls
A `Ball` has no collision, so the engine only moves it by its velocity
and adds gravity each frame. `update` does the bouncing by hand:
`getCameraSize()` is the size of the view in world units, and half of
it, less half the ball, is how far the center can go. Past a side the x
velocity is turned around and multiplied by `ballBounce`. At the bottom
the same is done to y, with a sound when the ball lands fast enough,
its volume the speed.

`render` draws the trail from the last 20 positions, the older a
position the smaller and fainter its circle, then the ball.
`drawCircle` takes a diameter, so the ball's size is passed as it is.

## Try it
- Take the range off the bounce: `tweak('ballBounce')`. It has a box
  and no slider.
- Widen the wind's range to `{min: -.02, max: .02}`.
- Add `tweak('cameraPos');` after the `showTrails` line: two numbers
  that move the camera.
- Set `debugTweakables` to `false`, then press Escape and 9 to bring
  the panel back.

## See also
Level Editor is the other debug tool, on the 0 key of the same overlay.
Debug Drawing shows the debug draw functions.
*/
