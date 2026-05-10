const saveName = 'LittleJS Save Demo';
let saveData;

function gameInit()
{
    canvasClearColor = hsl(.6,.3,.2);

    // load saved data, falling back to defaults on first run
    saveData = readSaveData(saveName, { clicks: 0, hue: 0 });
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // update and persist on every click
        saveData.clicks++;
        saveData.hue = rand();
        writeSaveData(saveName, saveData);
    }
    if (keyWasPressed('Space'))
    {
        // reset save data
        saveData = { clicks: 0, hue: 0 };
        writeSaveData(saveName, saveData);
    }
}

function gameRender()
{
    drawText('Click to increment   Space to reset', vec2(0, 6), 1);
    drawText('Clicks: ' + saveData.clicks, vec2(0, 3), 3);
    drawRect(vec2(0, -1), vec2(5), hsl(saveData.hue,.5,.5));
    drawText('Reload the page - data persists!', vec2(0, -5), 1);
}
