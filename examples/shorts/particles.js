let comet;

function gameInit()
{
    // a fire and its smoke, three times the size they are made for
    particleEffect('fire', vec2(-5,-2), {scale: 3});
    particleEffect('smoke', vec2(-5,1), {scale: 3});

    // sparks in blue, the hue turned half way around
    particleEffect('sparks', vec2(5,-2), {scale: 2, hue: .5});

    // a trail that follows the comet, moved each frame in gameUpdate
    comet = particleEffect('trail', vec2(), {scale: 2});
}

function gameUpdate()
{
    // move the comet back and forth so it leaves a trail
    comet.pos = vec2(sin(time)*9, cos(time)*2 + 4);
}

/* info
Four of the built-in particle effects, each made with one line: a fire
with smoke above it, blue sparks, and a trail behind a point that
circles the top of the view.

## How it works
`particleEffect(name, pos, options)` makes a `ParticleEmitter` set up as
one of the built-in effects and returns it. An emitter is an engine
object, so from then on the engine updates and draws it, and this
example needs no `gameRender`.

Every built-in effect is made to fit an object one unit across. The
options change it for this one use:

- `scale` grows the whole effect. The fire and smoke are at 3, so they
  fit something three units wide.
- `hue` turns the effect's colors around the color wheel, where 1 is
  all the way around. Sparks are yellow as made, and `hue: .5` turns
  them half way, to blue.
- `saturation` multiplies how strong the colors are, and 0 is grey.
- Any emitter setting by its name, like `emitTime`, `emitRate` or
  `speed`, replaces the effect's own.

The four effects here are continuous: they go on until the emitter is
destroyed. A one-shot like `'explosion'` ends itself.

### The trail
The trail's emitter is kept in `comet` because it moves. `gameUpdate`
runs 60 times a second and sets its `pos` to a point on an ellipse.
Particles already let go stay where they were, and that is what draws
the trail.

## Try it
- Change `'fire'` to `'magic'` or `'portal'`.
- Set the fire's `scale` to 1 to see the size the effects are made at.
- Add `saturation: 0` to the sparks' options for grey sparks.
- Add `emitTime: 1` to the smoke's options: it stops after a second.

## See also
Particle Effects shows every built-in effect, and Particle Options what
each option does. For an effect of your own, REFERENCE has the full
`ParticleEmitter` constructor.
*/
