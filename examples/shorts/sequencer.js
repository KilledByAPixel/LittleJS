const stepCount = 8, trackCount = 12, sequencer = [];
let currentStep = 0, stepTime = 0, tempo = 240;
let isPlaying = false, eraseMode; // undefined until a drag's first cell

// sound sequencer instruments
const sound_piano = new Sound([.3,0,220,,.1]);
const sound_drumKick = new Sound([,,99,,,.02,,,,,,,,2]);
const sound_drumHat = new Sound([,,1e3,,,.01,4,,,,,,,,,,,,,,4e3]);

// musical note scales
const majorScale = [0,2,4,5,7,9,11];
const minorScale = [0,2,3,5,7,8,10];
const pentatonicScale = [0,3,5,7,10];
const scale = majorScale;

class UISequencerButton extends UIButton
{
    constructor(step, track)
    {
        const size = vec2(68, 35);
        let pos = vec2(step, trackCount-1-track);
        pos = pos.multiply(size);
        pos = pos.add(vec2(240, 40)).subtract(mainCanvasSize.scale(.5));
        super(pos, size);

        this.step = step;
        this.track = track;
        this.cornerRadius = 0;
        this.dragActivate = true;
        this.isOn = false;
        this.shadowColor = CLEAR_BLACK;

        // set instrument and color based on track
        const pianoStart = 2;
        this.hue = track*.15;
        if (track >= pianoStart)
        {
            const octave = floor((track-pianoStart) / scale.length);
            const scaleNote = (track-pianoStart) % scale.length;
            this.semitone = scale[scaleNote] + 12*octave;
            this.sound = sound_piano;
            this.hue = .6 - scaleNote/40 + octave*.2;
        }
        else
            this.sound = [sound_drumKick, sound_drumHat][track];
    }
    onPress()
    {
        // set the button on/off and update sequencer table
        if (eraseMode === undefined)
            eraseMode = this.isOn;
        this.isOn = !eraseMode;
        eraseMode || this.playSound();
        const index = this.step + this.track*stepCount;
        sequencer[index] = eraseMode ? 0 : this;
    }
    render()
    {
        this.activeColor = eraseMode ? RED : WHITE;
        this.color = this.isActiveObject() ? BLACK : 
            hsl(this.hue, this.isOn ? 1 : .5, this.isOn ? .5 : .15); 
        if (isPlaying && this.step == currentStep)
            this.color = this.color.lerp(WHITE, .5);
        super.render();
    }
    playSound() { this.sound.playNote(this.semitone); }
}

function gameInit()
{
    // initialize UI system
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 8;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = GRAY;

    // create sequencer buttons
    for (let step=stepCount; step--;)
    for (let track=trackCount; track--;)
        new UISequencerButton(step, track);

    // create play/stop button
    const playPos = vec2(660,500).subtract(mainCanvasSize.scale(.5));
    const playButton = new UIButton(playPos, vec2(180,60), 'PLAY');
    playButton.onClick = ()=>
    {
        isPlaying = !isPlaying;
        currentStep = stepTime = 0;
        playButton.text = isPlaying ? 'STOP' : 'PLAY';
    };

    // create tempo slider
    const minTempo = 120, maxTempo = 480;
    const tempoPercent = percent(tempo, minTempo, maxTempo);
    const tempoPos = vec2(380,500).subtract(mainCanvasSize.scale(.5));
    const tempoSlider = new UISlider(tempoPos, vec2(340,40), tempoPercent);
    tempoSlider.onChange = ()=>
    {
        tempo = lerp(minTempo, maxTempo, tempoSlider.value);
        tempo = floor(tempo/10) * 10; // round down to a multiple of 10
        tempoSlider.text = `${tempo} BPM`;
    };
    tempoSlider.onChange();
}

function gameUpdate()
{
    // a drag ends when the mouse is let go, the next sets its own mode
    if (!mouseIsDown(0))
        eraseMode = undefined;

    if (!isPlaying)
        return;

    // update step time based on tempo
    const lastStepTime = stepTime;
    const lastStep = currentStep;
    stepTime += timeDelta*tempo/60;
    currentStep = floor(stepTime) % stepCount;
    if (currentStep == lastStep && lastStepTime)
        return;

    // play sounds when step changes
    for (let i=trackCount; i--;)
    {
        const index = currentStep + i*stepCount;
        const noteButton = sequencer[index];
        noteButton && noteButton.playSound();
    }
}

/* info
A step sequencer: a grid where each column is a moment in time and
each row is a drum or a note. Click a cell to turn it on, drag to
paint a run of cells, and start a drag on a lit cell to erase. PLAY
starts the loop and turns into STOP, and the slider sets the tempo.

## How it works
### The data
The grid is 8 steps wide and 12 tracks tall. `sequencer` is a flat
array with one place for each cell, at `step + track*stepCount`. A
place holds the cell's button when the cell is on and nothing when it
is off, so playing a step is a matter of looking down one column.

Three ZzFX sounds are the instruments: a short piano tone, a kick
drum and a hi-hat. `scale` chooses which notes the piano rows play,
as a list of semitones above the lowest note.

### UISequencerButton
Each cell is a `UIButton` of the UI plugin. UI positions are in
pixels from the center of the canvas with y going down. The
constructor works in pixels from the top left corner, which is easier
for a grid, and subtracts half of `mainCanvasSize`, the canvas size
in pixels, to convert. `trackCount-1-track` flips the rows so track 0
is at the bottom.

Tracks 0 and 1 are the kick and the hi-hat. From track 2 up the rows
are piano notes that climb the scale: the row's place in the scale is
`(track-2) % scale.length`, and each time the scale runs out the
notes go up an octave, 12 semitones. `sound.playNote(semitone)` plays
a sound with its pitch moved by that many semitones. The drums have
no `semitone`, and `playNote(undefined)` plays them as they are.

`dragActivate` makes a button count as pressed when the held mouse is
dragged onto it, which is what lets a drag paint cells.

### Painting and erasing
`onPress` is called for the cell under the mouse at the click and for
each cell the drag enters after it. `gameUpdate` sets `eraseMode`
back to `undefined` whenever `mouseIsDown(0)` is false, so only the
first cell a drag touches sets it, to whether that cell was already on,
even when the drag started outside the grid. Every cell
touched after it takes the same mode, and a drag either turns cells
on or turns them off, never a mix.

`render` is overridden to set the color every frame before the normal
drawing: bright when on, dark when off, and blended half way to white
with `color.lerp(WHITE, .5)` for the column being played.

### gameInit
After the 96 cells come the play button and the tempo slider. A
`UISlider` holds a `value` from 0 to 1. `percent(value, a, b)` says
how far a value is from `a` to `b` as 0 to 1, which turns the
starting tempo into a slider position. `lerp(a, b, percent)` is the
reverse and turns the position back into a tempo, which is then
rounded down to a multiple of 10.
`tempoSlider.onChange()` is called once by hand so the text is set
before the slider is first moved.

### gameUpdate
This is the clock. `timeDelta` is the length of one update in
seconds, and `tempo/60` is steps per second, so `stepTime` counts
steps as a fraction and `floor(stepTime) % stepCount` is the column
being played, going around after the last one.

Most updates fall inside the same step and return early. On the
update where the step changes, every track's place in that column is
checked and the buttons found there play their sounds. The
`lastStepTime` test lets the first column play at once when PLAY is
pressed, when the step has not changed yet but the time is 0.

## Try it
- Change `const scale = majorScale;` to `pentatonicScale`. With five
  notes to an octave, the ten piano rows cover two whole octaves.
- Change the starting tempo from `tempo = 240` to `tempo = 400`.
- Give the piano a longer note: change `[.3,0,220,,.1]` to
  `[.3,0,220,,.1,.5]`. The sixth number is the release.
- Make the played column stand out more: change `lerp(WHITE, .5)` to
  `lerp(WHITE, .9)`.

## See also
Piano plays notes from the mouse, and Sound Effects explains the
sound arrays. Timers shows the engine's `Timer` for timing things in
a game.
*/
