// particles with the built-in effects: each one line, placed, scaled
// and moved like any object; the Particle Effects short shows every one,
// and REFERENCE has the full ParticleEmitter constructor

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
