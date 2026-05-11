function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultSoundPress = new Sound([.5,0,220]);
    uiSystem.defaultSoundClick = new Sound([.5,0,440]);
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(0,0,.3);

    // outer vertical layout: title on top, grid below
    const menu = new UILayout(mainCanvasSize.scale(.5), 1, 20, 30);
    menu.addChild(new UIText(vec2(), vec2(400, 60), 'Level Select'));

    // inner 3x2 grid of level select buttons
    // build fully before adding so outer reads its final size
    const grid = new UILayout(vec2(), 3, 20, 0, true);
    for (let i = 1; i <= 6; ++i)
    {
        const button = new UIButton(vec2(), vec2(120, 80), 'Level\n' + i);
        button.color = hsl((i-1)/6, .7, .6);
        button.textHeight = 26;
        button.navigationIndex = i;
        button.onClick = ()=> canvasClearColor = hsl((i-1)/6, .5, .2);
        grid.addChild(button);
    }
    menu.addChild(grid);
}
