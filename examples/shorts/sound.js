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

/* info
Nine sound effects, each made from a short list of numbers and no
audio file. Click a button to hear its sound.

## How it works
LittleJS includes ZzFX, a small sound generator. A sound is described
by up to 21 numbers, and `new Sound([...])` builds the audio from them
once and keeps it, so playing it later is cheap.

### Reading a sound
The numbers are in a fixed order, and an empty place between two
commas takes that setting's default. The first eight are:

1. volume, 1 when left out
2. randomness, how much the pitch varies from one play to the next,
   `.05` when left out
3. frequency in Hz
4. attack, the seconds it takes to reach full volume
5. sustain, the seconds it holds
6. release, the seconds it takes to fade out
7. shape of the wave: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise,
   5 square
8. shape curve: 1 leaves the wave as it is, 0 squares it off and 2
   makes it pointy

So the coin, `[,,1675,,.06,.24,1,1.82,,,837,.06]`, is a triangle wave
at 1675 Hz that holds for `.06` of a second and fades over `.24`. The
`837` and `.06` further along are a pitch jump: after `.06` of a
second the pitch steps up by 837 Hz, which gives it the two tone
sound of a coin.

These arrays are not written by hand. The
[ZzFX sound designer](https://killedbyapixel.github.io/ZzFX/) is a
page for making a sound by ear, and it gives the array to paste into
the code.

### Playing
`sound.play()` plays it once. Because of the randomness, each play
has a slightly different pitch, which keeps a sound that repeats
often from grating. `play` can also take a position in the world, a
volume and a pitch, in that order.

Browsers do not allow audio until the user has clicked or pressed
something on the page. Here every sound starts from a click, so that
is never a problem.

### The buttons
`new UISystemPlugin` starts the UI plugin and sets `uiSystem`, which
holds the defaults new UI objects take. Shadows are clear by default,
so setting `defaultShadowColor` to `BLACK` gives every button one.

`new UIButton(pos, size, text)` makes a button, and its `onClick` is
called when it is clicked. UI positions and sizes are in pixels, not
world units. A position is measured from the center of the canvas and
y goes down, so the row at `1` is the bottom one. `makeSoundButton`
takes a place in a grid and multiplies it by the size of a button plus
the gap. `textHeight` sets the text's height in pixels, in place of
fitting it to the button.

## Try it
- Lower the coin's pitch: change `1675` to `800`.
- Take the randomness out of the piano: change `[1.5,.5,270` to
  `[1.5,0,270`. Every play is now the same note.
- Play every sound an octave up: change `sound.play()` to
  `sound.play(undefined, 1, 2)`.
- Make a sound in the ZzFX designer and paste its array over one of
  these.

## See also
Audio Effects sends sounds like these through reverb and echo, Piano
plays one sound as musical notes, and Music plays an audio file. UI
System covers the rest of the UI plugin.
*/
