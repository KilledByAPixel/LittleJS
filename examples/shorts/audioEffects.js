let effectButtons = [];

function gameInit()
{
    // initialize UI system
    new UISystemPlugin;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.7,.3,.2);

    // effects are made once and shared by every sound routed through them
    const muffle = new AudioFilter('lowpass', 400);
    const cave = new AudioReverb(3, 2);
    const echo = new AudioDelay(.25, .5);
    const crunch = new AudioDistortion(.6);
    const chain = new AudioFilter('lowpass', 800);
    chain.connect(cave); // filter first, then into the cave
    const compressor = new AudioCompressor(-30, 20);

    // sounds to try the effects on
    const sounds = [
        new Sound([,,1675,,.06,.24,1,1.82,,,837,.06]),          // coin
        new Sound([,,471,,.09,.47,4,1.06,-6.7,,,,,.9,61,.1,,.82,.1]), // zap
        new Sound([1.5,.5,270,,.1,,1,1.5,,,,,,,,.1,.01]),       // pad
    ];
    const w = 200, h = 100, gap = 20;
    const gridPos = (x, y)=> vec2(x*(w+gap), 50-y*(h+gap));

    // top row plays a sound through the current effect
    const icons = ['💰', '⚡', '🎹'];
    sounds.forEach((sound, i)=>
    {
        const button = new UIButton(gridPos(i-1, -1), vec2(w, h), icons[i]);
        button.textHeight = 60;
        button.onClick = ()=> sound.play();
    });

    // middle rows pick which effect the sounds play through
    const effects = [['Dry'], ['Muffle', muffle], ['Cave', cave],
        ['Echo', echo], ['Crunch', crunch], ['Chain', chain]];
    effects.forEach(([name, effect], i)=>
    {
        const button = new UIButton(gridPos(i%3-1, i/3|0), vec2(w, h), name);
        effectButtons.push(button);
        button.onClick = ()=>
        {
            // every play of these sounds now goes through the effect
            for (const sound of sounds)
                sound.output = effect?.input;
            for (const b of effectButtons)
                b.color = b === button ? hsl(.55,.6,.5) : hsl(0,0,.7);
        };
    });
    effectButtons[0].onClick();

    // bottom row toggles a compressor on everything via the master bus
    const compButton = new UIButton(gridPos(0, 2), vec2(w*2+gap, h), '');
    let compressorOn = false;
    compButton.onClick = ()=>
    {
        compressorOn = !compressorOn;
        compButton.text = 'Compressor ' + (compressorOn ? 'On' : 'Off');
        if (compressorOn)
            setAudioMasterEffect(compressor.input, compressor.output);
        else
            setAudioMasterEffect();
    };
    compButton.text = 'Compressor Off';
}
