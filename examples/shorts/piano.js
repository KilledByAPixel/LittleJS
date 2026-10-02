const pianoSound = new Sound([,0,220,,9]);

class PianoKey extends UIButton
{
    constructor(pos, size, semitone, color, hoverColor)
    {
        const keySize = 65;
        size = size.scale(keySize);
        pos = pos.scale(keySize).add(vec2(0,size.y/2-keySize*2));
        super(pos, size, '', color);

        this.dragActivate = true;
        this.semitone = semitone;
        this.hoverColor = hoverColor;
        this.activeColor = RED;
    }
    onPress()   { this.sound = pianoSound.playNote(this.semitone); }
    onRelease() { this.sound?.stop(.2); }
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
        const pos = vec2([1,2,4,5,6][i%5]+(i/5|0)*7-7.5, 0);
        const size = vec2(1, 2);
        const semitone = [1,3,6,8,10][i%5]+(i/5|0)*12;
        new PianoKey(pos, size, semitone, hsl(0,0,.3), hsl(0,1,.3));
    }
}

/* info
A piano keyboard of two octaves, with one sound playing every note.
Press a key to play it, and hold the mouse button and drag across the
keys to run along them. A note sounds for as long as its key is held.

## How it works
### One sound, many notes
`pianoSound` is a ZzFX sound, `[,0,220,,9]`: no randomness, a
frequency of 220 Hz, and a sustain of 9 seconds, so the tone holds for
as long as anyone is likely to hold a key. With no shape given it is a
sine wave.

`sound.playNote(semitone)` plays the sound with its pitch moved by a
number of semitones, the step from one piano key to the next. Twelve
semitones up is an octave, which is twice the frequency, so each
semitone multiplies the frequency by `2**(1/12)`. Semitone 0 is the
sound as made. `playNote` also plays with no randomness, so a note is
always in tune.

It returns the `SoundInstance` of that play. The key keeps it, and
`stop(.2)` on release fades that one note out over `.2` of a second
in place of cutting it off with a click.

### PianoKey
A key is a `UIButton` of the UI plugin, with two of the methods every
UI object has filled in: `onPress`, called when the mouse goes down
on it, and `onRelease`, called when that press ends.

`dragActivate` is what allows sliding along the keys. With it on, an
object is pressed when the held mouse is dragged onto it and released
when the mouse leaves it.

The colors are properties of the object: `color` normally,
`hoverColor` under the mouse and `activeColor` while pressed.

The constructor takes its position and size in keys and scales them
by `keySize`, 65 pixels. UI positions are the center of the object in
pixels from the center of the canvas, with y going down. Adding
`size.y/2` moves each key down by half its own height, so the white
keys, 4 high, and the black keys, 2 high, have their tops on one
line.

### gameInit
The first loop makes 15 white keys side by side. The list
`[0,2,4,5,7,9,11]` is the seven steps of a major scale in semitones,
`i%7` picks the step, and `(i/7|0)*12` adds 12 for each octave
already passed.

The second loop makes 10 black keys. Their semitones, `[1,3,6,8,10]`,
are the ones the white keys skip, and their positions sit half a key
to the side so that each is over the gap between two white keys.

The black keys are made after the white ones for a reason. UI objects
are drawn in the order they were made, so the black keys are on top,
and the plugin gives the mouse to the topmost object under it, so
they take the press where they overlap a white key.

## Try it
- Let notes ring: change `stop(.2)` to `stop(2)`.
- Change the wave: `[,0,220,,9]` to `[,0,220,,9,,2]` for a saw wave.
  The seventh number is the shape.
- Make the whole keyboard smaller: change `keySize = 65` to
  `keySize = 45`.
- Change the pressed color from `RED` to `hsl(.3,1,.5)`.

## See also
Step Sequencer plays the same kind of notes on a timer, Sound Effects
explains the sound arrays, and UI System the UI plugin.
*/
