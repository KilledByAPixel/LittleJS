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
    medalsForEach(medal=> medal.unlocked = false);

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
    pos = pos.add(vec2((1-medalsCount)*size/2, 100));
    medalsForEach(medal=>
    {
        if (!medal.unlocked)
            return;
        medal.renderIcon(pos, size);
        pos.x += size + 8;
    });
}