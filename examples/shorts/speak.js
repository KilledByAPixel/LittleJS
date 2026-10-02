function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.7,.3,.2);

    // create buttons to demo various speak() options
    const w = 280, h = 80, gap = 20;
    function makeButton(pos, text, onClick)
    {
        pos = pos.multiply(vec2(w+gap, h+gap));
        const button = new UIButton(pos, vec2(w, h), text);
        button.onClick = onClick;
    }

    // different language
    makeButton(vec2(-1,0), 'Italian',
        ()=> speak('Ciao mondo', 1, 1, 1, 'it'));

    // high pitch, fast
    makeButton(vec2(0,-1), 'High & Fast',
        ()=> speak('Hello World', 1, 2, 2));

    // default voice
    makeButton(vec2(0,0), 'Hello World',
        ()=> speak('Hello World'));

    // low pitch, slow
    makeButton(vec2(0,1), 'Low & Slow',
        ()=> speak('Hello World', 1, .5, .5));

    // stop all speech
    makeButton(vec2(1,0), 'Stop', speakStop);
}

/* info
Text spoken aloud by the browser's speech synthesis. The middle button
says Hello World in the default voice, the ones above and below it say
it high and fast or low and slow, the left one speaks Italian, and
Stop cuts the speech off.

## How it works
`speak(text, volume, rate, pitch, language)` hands text to the
browser's own text to speech. Only the text is needed.

- `volume` scales how loud it is. It is multiplied by the engine's
  `soundVolume` as well, so speech follows the game's volume.
- `rate` is how quickly it speaks and `pitch` how high the voice is.
  Both are 1 for normal. The order matters: rate comes before pitch.
- `language` is a language code such as `'en'`, `'it'`, `'fr'` or
  `'ja'`. Left out, the browser uses its default.

The four speaking buttons differ only in these arguments. The top
one passes 2 for both rate and pitch and the bottom one `.5` for
both, and the Italian one keeps the first three at 1 to reach the
fifth argument.

The voices belong to the browser and the system it runs on, not to
the engine. The same call sounds different on another machine, and a
language the browser has no voice for may not be spoken as that
language.

`speakStop()` stops what is being said and drops anything waiting to
be said. Speech waits its turn: a second `speak` while the first is
still talking is said after it, which is why a Stop is worth having.

### The buttons
`makeButton` makes a `UIButton` of the UI plugin and sets its
`onClick` to a function. For the speaking buttons that is an arrow
function that calls `speak`. For Stop the function `speakStop` itself
is passed, with no arrow function around it, since it takes no
arguments.

UI positions are in pixels from the center of the canvas with y going
down, so the button at `vec2(0,-1)` is the one above the middle. Each
grid place is multiplied by the size of a button plus the gap.

## Try it
- Change what the middle button says: `speak('Hello World')` to
  `speak('LittleJS can talk')`.
- Change the Italian button to French: `'Ciao mondo', 1, 1, 1, 'it'`
  to `'Bonjour le monde', 1, 1, 1, 'fr'`.
- Make the top button fast and low: change its `1, 2, 2` to
  `1, 2, .5`.
- Click a button several times quickly to hear the speech queue up,
  then Stop.

## See also
Sound Effects and Music for the rest of the engine's audio, and UI
System for the UI plugin.
*/
