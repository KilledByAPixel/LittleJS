function gameInit()
{
    // initialize UI system
    new UISystemPlugin;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.6,.3,.2);

    // create a grid of buttons with different sounds
    const w = 200, h = 150, gap = 20;
    function makeSoundButton(pos, icon, sound)
    {
        pos = pos.multiply(vec2(w+gap, h+gap));
        pos = pos.add(mainCanvasSize.scale(.5));
        const button = new UIButton(pos, vec2(w, h), icon);
        button.textHeight = 100;
        button.onClick = ()=> sound.play();
    }
    makeSoundButton(vec2(-1, 1),'💰', 
        new Sound([,,1675,,.06,.24,1,1.82,,,837,.06]));
    makeSoundButton(vec2( 0, 1),'🥊', 
        new Sound([,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]));
    makeSoundButton(vec2( 1, 1),'✨', 
        new Sound([,,539,0,.04,.29,1,1.92,,,567,.02,.02,,,,.04]));
    makeSoundButton(vec2(-1, 0),'🐁', 
        new Sound([,.2,1e3,.02,,.01,2,,18,,475,.01,.01]));
    makeSoundButton(vec2( 0, 0),'🎹', 
        new Sound([1.5,.5,270,,.1,,1,1.5,,,,,,,,.1,.01]));
    makeSoundButton(vec2( 1, 0),'🏌️', 
        new Sound([,,150,.05,,.05,,1.3,,,,,,3])); 
    makeSoundButton(vec2(-1,-1),'🌊', 
        new Sound([,.2,40,.5,,1.5,,11,,,,,,199]));
    makeSoundButton(vec2( 0,-1),'🛰️', 
        new Sound([,.5,847,.02,.3,.9,1,1.67,,,-294,.04,.13,,,,.1]));
    makeSoundButton(vec2( 1,-1),'⚡', 
        new Sound([,,471,,.09,.47,4,1.06,-6.7,,,,,.9,61,.1,,.82,.1]));
}