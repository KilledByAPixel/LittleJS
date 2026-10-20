function gameInit()
{
    canvasClearColor = hsl(.6, .3, .2);

    // a field of tiles, to see the view move against
    for (let x = -12; x <= 12; x += 2)
    for (let y = -8; y <= 8; y += 2)
    {
        const color = hsl(rand(), .6, .6);
        new EngineObject(vec2(x, y), vec2(1.6), tile(randInt(8)), 0, color);
    }

    // start with a shake, to see what it does
    cameraShake(.6);
}

function gameUpdate()
{
    // a small bump on Space, a big blast on a click
    if (keyWasPressed('Space'))
        cameraShake(.3);
    if (mouseWasPressed(0))
        cameraShake(.8);
}

function gameRenderPost()
{
    const pos = vec2(mainCanvasSize.x/2, 50);
    drawTextScreen('Space for a bump, click for a blast', pos, 36);
}

/* info
A field of tiles and a camera shake. It starts with one, then Space
gives the view a small bump and a click a big blast; press again while
it shakes and the shakes add up.

## How it works
`cameraShake(amount)` adds to how much shake is going, which is at
most 1, and it fades by itself, by `cameraShakeDecay` a second, so a
full shake is gone in a second.

The view moves by smooth noise, scaled by the shake squared. Squared
means a little shake is gentle and a big one is wild, and the end of a
shake fades out softly. A full shake moves the view up to
`cameraShakeDistance` world units and turns it up to
`cameraShakeAngle` radians.

Only what is drawn moves. The engine adds the shake just before a
frame draws and takes it back right after, so `cameraPos` and
`cameraAngle` stay where the game put them, and a camera that follows
something is not thrown off by it. It works the same with a
`FollowCamera` and in 3D, and it holds while the game is paused.

## Try it
- A heavier shake: in `gameInit` add `setCameraShakeDistance(2);`.
- A long rumble: add `setCameraShakeDecay(.3);`.
- Move without turning: add `setCameraShakeAngle(0);`.
- Shake on every frame a key is held: change `keyWasPressed` to
  `keyIsDown` and `.3` to `.05`.

## See also
Top Down follows a player with a `FollowCamera`, and Camera Mouse Drag
moves the camera by hand. 3D Third Person has a camera in 3D.
*/
