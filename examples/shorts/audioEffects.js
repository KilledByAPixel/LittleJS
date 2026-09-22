let effectButtons = [];

function gameInit()
{
    // initialize UI system
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.7,.3,.2);

    // effects are made once and shared by every sound using them
    const muffle = new AudioFilter('lowpass', 400);
    const cave = new AudioReverb(3, 2);
    const echo = new AudioDelay(.25, .5);
    const crunch = new AudioDistortion(.6);
    const chain = new AudioFilter('lowpass', 800);
    chain.connect(cave); // filter first, then into the cave
    const compressor = new AudioCompressor(-30, 20);

    // sounds to try the effects on
    const sounds = [
        new Sound([,,1676,,,.25,1,2,,,838,.05]),   // coin
        new Sound([,,500,,,.6,4,,-7,,,,,1,60,.1]), // zap
        new Sound([,.5,,,.1,,,1.5,,,,,,,,.1]),     // pad
    ];
    const w = 200, h = 100, gap = 20;
    const gridPos = (x, y)=> vec2(x*(w+gap), y*(h+gap)-60);

    // top row plays a sound through the current effect
    const icons = ['💰', '⚡', '🎹'];
    sounds.forEach((sound, i)=>
    {
        const pos = gridPos(i-1, -1);
        const button = new UIButton(pos, vec2(w, h), icons[i]);
        button.textHeight = 60;
        button.onClick = ()=> sound.play();
    });

    // middle rows pick which effect the sounds play through
    const effects = [['Dry'], ['Muffle', muffle], ['Cave', cave],
        ['Echo', echo], ['Crunch', crunch], ['Chain', chain]];
    effects.forEach(([name, effect], i)=>
    {
        const pos = gridPos(i%3-1, i/3|0);
        const button = new UIButton(pos, vec2(w, h), name);
        effectButtons.push(button);
        button.onClick = ()=>
        {
            // playing these sounds now goes through the effect
            for (const sound of sounds)
                sound.output = effect;
            for (const b of effectButtons)
                b.color = b === button ? hsl(.5,.8,.5) : hsl(0,0,.7);
        };
    });
    effectButtons[0].onClick();

    // bottom row toggles a compressor on everything
    const compButton = new UIButton(gridPos(0,2), vec2(w*2+gap, h));
    let compressorOn = false;
    compButton.onClick = ()=>
    {
        compressorOn = !compressorOn;
        const onText = (compressorOn ? 'On' : 'Off');
        compButton.text = 'Compressor ' + onText;
        if (compressorOn)
            setAudioMasterEffect(compressor);
        else
            setAudioMasterEffect();
    };
    compButton.text = 'Compressor Off';
}
