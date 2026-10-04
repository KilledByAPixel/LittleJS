// create example medals
const medal_openedExample = new Medal(0, 'Open', 'Opened this example!');
const medal_leftClick = new Medal(1, 'Lefty', 'Left clicked!', '🐁');
const medal_rightClick = new Medal(2, 'Righty', 'Right clicked!', '🐭');
const medal_spacePressed = new Medal(3, 'Space', 'Pressed spacebar!', '🚀');

function gameInit()
{
    // setup medals
    const saveName = 'Medals Example';
    medalsInit(saveName);

    // clear unlocked medals for testing
    medalsReset();

    // unlock the example medal
    medal_openedExample.unlock();

    // set background color
    canvasClearColor = hsl(.5,.3,.2);
}

function gameUpdate()
{
    // unlock example medals based on input
    if (mouseWasPressed(0))
        medal_leftClick.unlock();
    if (mouseWasPressed(2))
        medal_rightClick.unlock();
    if (keyWasPressed('Space'))
        medal_spacePressed.unlock();
}

function gameRenderPost()
{
    const size = 80;
    let pos = mainCanvasSize.scale(.5).subtract(vec2(0,40));
    drawTextScreen('Unlocked Medals', pos, size);

    // show unlocked medals
    let medalsCount = 0;
    medalsForEach(medal=> medal.unlocked && medalsCount++);
    pos = pos.add(vec2((1-medalsCount)*(size+8)/2, 100));
    medalsForEach(medal=>
    {
        if (!medal.unlocked)
            return;
        medal.renderIcon(pos, size);
        pos.x += size + 8;
    });
}

/* info
Achievements: four medals, each unlocked by doing one thing. Opening
the example unlocks the first. A left click, a right click and the
space bar unlock the others. A notice slides in at the top of the
screen for each one, and the icons of the unlocked medals line up in
the middle.

## How it works
A `Medal` is one achievement. The medal system keeps the list of them,
remembers which are unlocked in local storage, and shows the notice.

### The medals
`new Medal(id, name, description, icon)` makes a medal and adds it to
the list. The `id` is a number of 0 or more that no other medal has. It
is the key the medal is saved under, so it must stay the same from one
version of a game to the next. The icon is a piece of text, here an
emoji, and a trophy when left out, as for the first medal. A fifth
argument can name an image file to use in its place.

The medals are made at the top of the file, before `gameInit`, because
`medalsInit` wants every medal to exist when it is called.

### gameInit
- `medalsInit(saveName)` reads which medals were unlocked before from
  local storage under that name, and adds the notice to what the engine
  draws. The name must not be one the game saves its own data under.
- `medalsReset()` locks every medal again and saves that. It is here so
  the example starts fresh each time. A game would leave it out.
- `medal_openedExample.unlock()` unlocks the first medal at once.

`unlock()` does nothing when the medal is already unlocked. Otherwise
it marks it, saves, and puts it in the queue of notices. The notices
show one at a time, each for `medalDisplayTime`, 5 seconds, sliding on
and off.

### gameUpdate
`mouseWasPressed(0)` is the left button and `mouseWasPressed(2)` the
right. `keyWasPressed` takes a key's code, `'Space'`. There is no check
for whether a medal is unlocked already, since `unlock()` does it.

### gameRenderPost
This draws over everything, in screen space: positions are pixels from
the top left of the canvas, and y goes down. `mainCanvasSize.scale(.5)`
is the middle of the canvas, and the title is 40 pixels above it, 80
pixels tall.

`medalsForEach(callback)` calls a function with every medal. The first
pass counts the unlocked ones, so the row can start further left the
more there are, half a step of 88 pixels for each one after the first,
which keeps the row centered. The second draws each with `medal.renderIcon(pos,
size)`, which takes a screen position and a size in pixels, and steps
88 pixels to the right.

## Try it
- Take out the `medalsReset();` line and unlock a few. Restart, and
  they are still unlocked, with no notice for them.
- Add `setMedalDisplayTime(1);` to `gameInit` for shorter notices.
- Change an icon, `'🚀'`, to another emoji or a letter.
- Draw the row bigger: `const size = 80;` to `const size = 120;`.

## See also
Save / Load shows the storage the medals are kept in. Starter in the
full examples unlocks a medal on a click. The Newgrounds plugin has
`NewgroundsMedal`, a medal held on that site's servers.
*/
