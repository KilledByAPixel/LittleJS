const pianoSound = new Sound([,0,220,,9]), keys = [];

class PianoKey extends EngineObject
{
    constructor(pos, size, semitone, isWhite)
    {
        const keySize = 2;
        size = size.scale(keySize);
        pos = pos.scale(keySize).add(vec2(0,4-size.y/2));
        super(pos, size, 0, 0, hsl(0,0,isWhite ? 1 : .3));
        this.drawSize = size.subtract(vec2(.1,0));
        this.semitone = semitone;
    }
    press()
    {
        if (!this.isDown)
            pianoSound.playNote(this.semitone);
        this.isDown = true;
    }
    release()
    {
        if (this.isDown)
            pianoSound.stop(.2);
        this.isDown = false;
    }
}

function gameInit()
{
    // create piano keyboard
    for(let i=15; i--;)
        keys.unshift(new PianoKey(vec2(i-7,0), vec2(1,4), [0,2,4,5,7,9,11][i%7]+(i/7|0)*12, 1));
    for(let i=10; i--;)
        keys.unshift(new PianoKey(vec2([1,2,4,5,6][i%5]+(i/5|0)*7-7.5,0), vec2(1,2), [1,3,6,8,10][i%5]+(i/5|0)*12));
}

function gameUpdate()
{
    // update state of piano keys
    const pressedKey = keys.find(k=>k.isDown);
    const newPressedKey = mouseIsDown(0) && keys.find(k=>isOverlapping(k.pos, k.size, mousePos));
    if (newPressedKey != pressedKey)
    {
        pressedKey && pressedKey.release();
        newPressedKey && newPressedKey.press();
    }
}