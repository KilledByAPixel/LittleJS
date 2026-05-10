function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.7,.3,.2);

    // create buttons to demo various speak() options
    const w = 280, h = 80, gap = 20;
    function makeButton(pos, text, onClick)
    {
        pos = pos.multiply(vec2(w+gap, h+gap));
        pos = pos.add(mainCanvasSize.scale(.5));
        const button = new UIButton(pos, vec2(w, h), text);
        button.onClick = onClick;
    }

    // default voice
    makeButton(vec2(0,-1), 'Hello World',
        ()=> speak('Hello World'));

    // different language
    makeButton(vec2(-1,0), 'Italian',
        ()=> speak('Ciao mondo', 'it'));

    // high pitch, fast
    makeButton(vec2(0,0), 'High & Fast',
        ()=> speak('Hello World', '', 1, 2, 2));

    // low pitch, slow
    makeButton(vec2(1,0), 'Low & Slow',
        ()=> speak('Hello World', '', 1, .5, .5));

    // stop all speech
    makeButton(vec2(0,1), 'Stop', speakStop);
}
