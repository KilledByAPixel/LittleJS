const saveName = 'LittleJS Save Demo';
let saveData;

function gameInit()
{
    // load saved data with defaults on first run
    saveData = { clicks: 0, hue: 0 };
    saveData = readSaveData(saveName, saveData);
}

function gameUpdate()
{
    // Space or a click on the top line resets, so a phone can reset too
    const reset = keyWasPressed('Space') ||
        mouseWasPressed(0) && mousePos.y > 5;
    if (mouseWasPressed(0) && !reset)
    {
        // update and persist on every click
        saveData.clicks++;
        saveData.hue = rand();
        writeSaveData(saveName, saveData);
    }
    if (reset)
    {
        // reset save data
        saveData = { clicks: 0, hue: 0 };
        writeSaveData(saveName, saveData);
    }
}

function gameRender()
{
    drawText('Click to add   Space or click here to reset', vec2(0, 6), 1);
    drawText('Clicks: ' + saveData.clicks, vec2(0, 3), 3);
    drawRect(vec2(0, -1), vec2(5), hsl(saveData.hue,.5,.5));
    drawText('Reload the page - data persists!', vec2(0, -5), 1);
}

/* info
A click counter that is still there after the page is reloaded. Click to
add one and give the square a new color, and press Space, or click the
line of text at the top, to start again from zero.

## How it works
The browser's local storage keeps text under a name, for this web site,
until it is cleared. Two engine functions put an object there and get it
back.

- `writeSaveData(saveName, saveData)` turns the object into JSON text
  and stores it under the name.
- `readSaveData(saveName, defaultSaveData)` reads that text back into an
  object. What it returns is `{...defaults, ...loaded}`: every value
  that was saved, and the default for any that was not. The defaults
  must be an object, not a single number.

`saveName` is the name the data is kept under. Every game on the same
site shares the storage, so the name has to be the game's own.

### gameInit
`saveData` is first set to the values of a first run, no clicks and a
hue of 0, and those are handed to `readSaveData` as the defaults. The
first time there is nothing stored and the defaults come back. After
that the stored count and hue do.

### gameUpdate
`mouseWasPressed(0)` is true on the frame the left button goes down.
The count goes up by one, `rand()` picks a hue between 0 and 1, and the
object is written straight away, so there is no save step to forget.

Space, or a click above `y` 5 where the top line is, sets `saveData`
to a new object with the first values and writes that, and that click
does not count. Writing is what resets the save: changing the variable alone
would bring the old count back at the next reload.

### gameRender
The count and the square are drawn from `saveData` every frame. The
square's color is `hsl(saveData.hue,.5,.5)`, so the hue is the only
part of the color that needs saving.

Only plain data survives the trip through JSON: numbers, strings, true
and false, arrays and objects of those. A `Vector2` or a `Color` comes
back as a plain object without its methods, so save its numbers and
build it again after loading, as the hue is here.

## Try it
- Change anything in the code. The example starts again and the count
  is still there.
- Count in tens: `saveData.clicks++` to `saveData.clicks += 10`.
- Change `saveName` to `'LittleJS Save Demo 2'`. It is a new save, and
  it starts from zero. The old one is still stored under the old name.
- Take out the `writeSaveData` line under `saveData.hue = rand();`.
  The count still goes up, but a reload brings back the old one.

## See also
Medals keeps its unlocks the same way under a name of its own. Puzzle
Game in the full examples saves a best score.
*/
