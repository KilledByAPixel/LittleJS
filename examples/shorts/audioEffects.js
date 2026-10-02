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

/* info
Three sounds played through audio effects: a filter, a reverb, an
echo, distortion, and two effects chained together. The top row of
buttons plays a sound. The six buttons under it choose which effect
the sounds go through, with Dry meaning none. The wide button at the
bottom turns a compressor on and off for everything.

## How it works
The effects come from the audio effects plugin. Each one is an object
that sound flows into and out of, and each has a `mix` between the
untouched sound, called dry, and the processed sound, called wet.

### The effects
They are made once in `gameInit`. An effect is not tied to one sound:
any number of sounds can play through the same one.

- `new AudioFilter('lowpass', 400)` lets through what is below 400 Hz
  and cuts what is above, which muffles a sound as if it were behind a
  wall. The type is one of the browser's filter types, `'highpass'`
  and `'bandpass'` among them.
- `new AudioReverb(3, 2)` is the sound of a large space. The first
  number is how many seconds the tail lasts and the second how quickly
  it fades, higher being faster.
- `new AudioDelay(.25, .5)` is an echo: a quarter of a second between
  repeats, and each repeat feeds half of itself back in to make the
  next.
- `new AudioDistortion(.6)` overdrives the sound. 0 is clean and 1 is
  crushed.
- `new AudioCompressor(-30, 20)` turns down whatever is louder than
  the threshold, -30 dB. A ratio of 20 means 20 dB over the threshold
  comes out as 1.

### Routing a sound
A `Sound` has an `output`. Left `undefined`, the sound plays straight
to the engine's master volume. Set to an effect, every play of that
sound from then on goes through it. That is all an effect button
does: it sets `output` on the three sounds. The Dry button's entry
has no effect in it, so it sets `output` back to `undefined`.

A sound already playing keeps the route it started with, since the
output is read when `play` is called.

### Chaining
`chain.connect(cave)` sends what comes out of one effect into another
effect. A sound whose `output` is `chain` goes through
the 800 Hz filter first and then the reverb. `cave` itself is not
changed by this, so the Cave button still gives the reverb alone.

### The master effect
`setAudioMasterEffect(effect)` puts an effect between the master
volume and the speakers, so everything the engine plays goes through
it, after any effect of its own. A compressor is the usual choice
there: it keeps many sounds at once from getting too loud. Calling it
with no argument takes the effect away again.

### The buttons
The UI plugin is covered in the Sound Effects example. `gridPos`
turns a column and a row into pixels from the center of the canvas,
where y goes down. `effectButtons[0].onClick()` calls the Dry
button's own handler once at the start, so one button is lit from the
beginning.

## Try it
- Change `'lowpass', 400` to `'highpass', 2000` for a thin, tinny
  sound in place of a muffled one.
- Make the cave huge: change `AudioReverb(3, 2)` to
  `AudioReverb(6, 1)`. Chain uses the same reverb, so it changes too.
- Change `AudioDelay(.25, .5)` to `AudioDelay(.1, .8)` for fast
  echoes that take a long time to fade.
- Change `AudioDistortion(.6)` to `AudioDistortion(1)`.

## See also
Sound Effects explains the arrays the sounds are made from. Each
effect has methods to change it while it plays, `setMix`,
`setFrequency` and `setRoom` among them, and several take a time to
fade over.
*/
