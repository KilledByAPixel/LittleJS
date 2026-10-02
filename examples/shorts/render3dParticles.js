let fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.3,.1), hsl(0,.3,.2), hsl(0,0,.1));
    render3D.ambientColor = hsl(.6,.1,.3);
    new CameraControl3D(vec3(0,2,0), 14, .3, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, hsl(.6,.1,.4)));

    // built-in effects, the same ones 2D games use, one line each
    particleEffect3D('fire', vec3(-5,1,0), {scale: 3});
    particleEffect3D('smoke', vec3(-5,3,0), {scale: 2});
    particleEffect3D('sparks', vec3(5,2,0), {scale: 3});

    // a fountain: splash kept going, its settings replaced by the options;
    // it emits along its local +Y so rotation3D aims it
    fountain = particleEffect3D('splash', vec3(0,.5,3), {scale: 2,
        emitTime: 0, emitRate: 200, emitConeAngle: .15, emitSize: 0,
        speed: .125, gravity: -.004, particleTime: 1});
}

function gameUpdate()
{
    // sway the fountain
    fountain.rotation3D.z = sin(time)*.5;
}

/* info
The built-in particle effects in 3D: a fire with smoke above it, sparks,
and a fountain that sways. Drag to turn the camera and roll the wheel to
zoom. Left alone, the camera turns slowly on its own.

## How it works
`gameInit` starts like every 3D short: the plugin, a sky, a camera and a
floor. `setSky` takes a third color here, the one straight down, and
`new CameraControl3D(target, distance, pitch, idleSpin)` a fourth
argument: how far the camera turns each frame while it is not dragged.
The floor is `buildGrid` with one cell, a plain square 20 units wide.

### The effects
`particleEffect3D(name, pos3D, options)` is the 3D twin of
`particleEffect`. It makes a `ParticleEmitter3D` set up as one of the
built-in effects and returns it. An emitter is an engine object, so the
engine updates and draws it from then on. Both functions read the same
effect data, which is why the comment calls them the ones 2D games use.
In 3D each particle is a flat square that faces the camera.

Every built-in effect is made to fit an object one unit across. `scale`
in the options grows the whole effect: the area the particles start in,
their sizes, their speed and their fall.

### The fountain
`'splash'` is a one-shot, a short burst that ends itself. Any emitter
setting named in the options replaces the effect's own, and these turn
the burst into a steady jet:

- `emitTime: 0` emits forever, and `emitRate` is particles per second.
- `emitConeAngle` is the half angle of the cone the particles leave in,
  in radians, so `.15` is narrow. `emitSize: 0` starts them all at one
  point.
- `speed` is in world units per frame. `gravity` is added to each
  particle's y velocity every frame, so a negative one pulls it down.
- `particleTime` is how many seconds a particle lives.

An emitter shoots along its own up axis, and `rotation3D` turns that
axis. `fountain` is kept in a variable so `gameUpdate` can set its roll,
`rotation3D.z`, to `sin(time)*.5`: the jet leans up to half a radian to
each side.

## Try it
- Change `'sparks'` to `'magic'` or `'portal'`.
- Add `hue: .5` to the fire's options, after `scale: 3`, to turn its
  colors half way around the color wheel.
- Change `emitConeAngle: .15` to `1` for a wide spray.
- Change `sin(time)*.5` to `time` and the jet turns all the way around.

## See also
Particles, Particle Effects and Particle Options show the same effects
in 2D, with every name and option. 3D Water makes rain from one, and
3D Trails draws ribbons behind moving objects. For an effect of your
own, look up `ParticleEmitter3D`.
*/
