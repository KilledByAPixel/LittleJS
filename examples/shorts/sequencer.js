const stepCount = 8, trackCount = 12, sequencer = [];
let currentStep = 0, stepTime = 0, tempo = 240;
let isPlaying = false, eraseMode = false;

// sound sequencer instruments
const sound_piano = new Sound([.4,0,220,,.1]);
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
        pos = pos.add(vec2(240, 40));
        super(pos, size);

        this.step = step;
        this.track = track;
        this.cornerRadius = 0;
        this.dragActivate = true;
        this.isOn = false;

        // set instrument and color based on track
        const pianoStart = 2;
        this.hue = track*.15;
        if (track >= pianoStart)
        {
            const octave = Math.floor((track-pianoStart) / scale.length);
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
        if (mouseWasPressed(0))
            eraseMode = this.isOn;
        this.isOn = !eraseMode;
        eraseMode || this.playSound();
        sequencer[this.step + this.track*stepCount] = eraseMode ? 0 : this;
    }
    render()
    {
        this.activeColor = eraseMode ? RED : WHITE;
        this.color = this.isActiveObject() ? BLACK : 
            hsl(this.hue, this.isOn ? 1 : .5, this.isOn ? .5 : .1); 
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
    canvasClearColor = hsl(0,0,.3);

    // create sequencer buttons
    for (let step=stepCount; step--;)
    for (let track=trackCount; track--;)
        new UISequencerButton(step, track);

    // create play/stop button
    const playButton = new UIButton(vec2(660,500), vec2(180,60), 'PLAY');
    playButton.onClick = ()=>
    {
        isPlaying = !isPlaying;
        currentStep = stepTime = 0;
        playButton.text = isPlaying ? 'STOP' : 'PLAY';
    };

    // create tempo slider
    const minTempo = 120, maxTempo = 480;
    const tempoPercent = percent(tempo, minTempo, maxTempo);
    const tempoSlider = new UIScrollbar(vec2(380,500), vec2(340,40), tempoPercent);
    tempoSlider.onChange = ()=>
    {
        tempo = lerp(minTempo, maxTempo, tempoSlider.value);
        tempo = Math.floor(tempo/10) * 10; // round to nearest 10th
        tempoSlider.text = `${tempo} BPM`;
    };
    tempoSlider.onChange();
}

function gameUpdate()
{
    if (!isPlaying)
        return;

    // update step time based on tempo
    const lastStepTime = stepTime;
    const lastStep = currentStep;
    stepTime += timeDelta*tempo/60;
    currentStep = Math.floor(stepTime) % stepCount;
    if (currentStep == lastStep && lastStepTime)
        return;

    // play sounds when step changes
    for (let i=trackCount; i--;)
    {
        const noteButton = sequencer[currentStep + i*stepCount];
        noteButton && noteButton.playSound();
    }
}