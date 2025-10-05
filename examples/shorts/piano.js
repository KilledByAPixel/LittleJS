const pianoSound = new Sound([,0,220,,9]);

class PianoKey extends UIButton
{
    constructor(pos, size, semitone, isWhite)
    {
        const keySize = 65;
        size = size.scale(keySize);
        pos = pos.scale(keySize).add(vec2(0,size.y/2-keySize*2));
        pos = pos.add(mainCanvasSize.scale(.5));
        super(pos, size, '', hsl(0,0,isWhite ? 1 : .3));
        this.semitone = semitone;
        this.dragActivate = true;
        this.hoverColor = hsl(0,1,isWhite ? .9 : .3);
        this.activeColor = RED;
    }
    onPress()
    {
        if (!this.soundInstance)
            this.soundInstance = pianoSound.playNote(this.semitone);
    }
    onRelease()
    {
        if (this.soundInstance)
            this.soundInstance.stop(.2);
        this.soundInstance = 0;
    }
}

function gameInit()
{
    // initialize UI system
    new UISystemPlugin;

    // create piano keyboard
    for (let i=15; i--;)
    {
        const pos = vec2(i-7,0);
        const size = vec2(1,4);
        const semitone = [0,2,4,5,7,9,11][i%7]+(i/7|0)*12;
        new PianoKey(pos, size, semitone, true);
    }
    for (let i=10; i--;)
    {
        const pos = vec2([1,2,4,5,6][i%5]+(i/5|0)*7-7.5,0)
        const size = vec2(1,2);
        const semitone = [1,3,6,8,10][i%5]+(i/5|0)*12;
        new PianoKey(pos, size, semitone);
    }
}