const pianoSound = new Sound([,0,220,,9]);

class PianoKey extends UIButton
{
    constructor(pos, size, semitone, color, hoverColor)
    {
        const keySize = 65;
        size = size.scale(keySize);
        pos = pos.scale(keySize).add(vec2(0,size.y/2-keySize*2));
        pos = pos.add(mainCanvasSize.scale(.5));
        super(pos, size, '', color);

        this.dragActivate = true;
        this.semitone = semitone;
        this.hoverColor = hoverColor;
        this.activeColor = RED;
    }
    onPress()   { this.soundInstance = pianoSound.playNote(this.semitone); }
    onRelease() { this.soundInstance.stop(.2); }
}

function gameInit()
{
    // initialize UI system
    new UISystemPlugin;

    // create piano keyboard
    for (let i=15; i--;)
    {
        // white keys
        const pos = vec2(i-7, 0);
        const size = vec2(1, 4);
        const semitone = [0,2,4,5,7,9,11][i%7]+(i/7|0)*12;
        new PianoKey(pos, size, semitone, WHITE, hsl(0,1,.9));
    }
    for (let i=10; i--;)
    {
        // black keys
        const pos = vec2([1,2,4,5,6][i%5]+(i/5|0)*7-7.5, 0)
        const size = vec2(1, 2);
        const semitone = [1,3,6,8,10][i%5]+(i/5|0)*12;
        new PianoKey(pos, size, semitone, hsl(0,0,.3), hsl(0,1,.3));
    }
}