let puffs = [], light;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.65,.4,.15), hsl(.65,.3,.08), hsl(0,0,.05));
    render3D.ambientColor = hsl(.65,.3,.15);
    render3D.sunColor = hsl(.1,.2,.25);
    new CameraControl3D(vec3(0,2,0), 12, .2, .001);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, hsl(.6,.1,.3)));

    // a soft round puff drawn once, every sprite of the cloud uses it
    const canvas = new OffscreenCanvas(64, 64);
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32,32,0, 32,32,32);
    gradient.addColorStop(0, 'hsla(0,0%,100%,.9)');
    gradient.addColorStop(1, 'hsla(0,0%,100%,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const puff = tile(0, 64, new TextureInfo(canvas), 0); // no padding

    // the cloud: see through sprites in a ball, lit like everything else
    for (let i = 70; i--;)
    {
        const pos = randInSphere(3).multiply(vec3(1, .5, .7));
        const sprite = new EngineObject3D(pos.add(vec3(0,2.5,0)),
            undefined, puff, hsl(0, 0, rand(.7, 1)));
        sprite.scale3D = vec3(rand(1.5, 2.5));
        sprite.transparent = true;
        puffs.push(sprite);
    }

    // a warm light that drifts through the cloud, its glow added on
    light = new Light3D(vec3(), 4, hsl(.08,1,.6), 2);
    light.glow = .6;
}

function gameUpdate()
{
    light.pos3D = vec3(cos(time*.7)*3, 2.5+sin(time*1.3)*.6, sin(time*.7)*2);

    // Space lights the puffs as round balls or the same all over
    if (keyWasPressed('Space'))
        for (const sprite of puffs)
            sprite.roundLighting = !sprite.roundLighting;
}

function gameRenderPost()
{
    const round = puffs[0].roundLighting ? 'round' : 'even';
    drawTextScreen('Space: ' + round + ' lighting',
        vec2(mainCanvasSize.x/2, 40), 30, WHITE, 4);
}

/* info
A cloud of soft sprites with a warm light drifting through it: the puffs
near the light glow, the rest stay in the cool shade of the night. Space
switches the puffs between being lit the same all over and lit as round
balls. Drag to turn the camera and roll the wheel to zoom.

## How it works
A sprite in 3D is an `EngineObject3D` with a tile and no mesh, a flat
square that always faces the camera. Sprites are lit like everything
else, but since a sprite always faces the camera, the way it faces would
say nothing about where the light is. So each light lights a sprite by
how near it is, from any side, along with the sun, the ambient color and
the shadows. A puff on the far side of the light glows as much as one in
front of it.

### The puffs
The puff is drawn once on a canvas, a soft white circle from
`createRadialGradient`, and made a texture with `TextureInfo`; `tile`
takes it with a padding of 0, since the whole canvas is the puff. Every
sprite of the cloud draws that one tile in its own gray. Each is
`transparent`, so the soft edges blend.

`randInSphere` scatters them in a ball, squashed a little by `multiply`.

### Round lighting
With `roundLighting` on, a sprite is lit as if it bulged toward the
camera like a ball: bright on the side toward the light and darker away
from it, which gives the cloud depth. A sprite with a normal map is lit
by the map instead, as a card facing the camera.

### The light
`new Light3D(pos3D, radius, color, intensity)` lights what is within its
radius, and `glow` draws a soft haze at it. The glow is additive, light
of its own, so it stays unlit. `gameUpdate` moves the light on a loop.

## Try it
- Make the cloud glow with no light at all: in the loop, add
  `sprite.emissive = 1;` and the puffs keep their own colors.
- Light the cloud from the sun: change `render3D.sunColor` to
  `hsl(.1,.5,.8)`.
- Start round: in the loop, add `sprite.roundLighting = true;`.

## See also
3D Billboards draws tile sprites that face the camera, 3D Particles the
built-in effects, which are lit the same way, and 3D Lights colored
point lights on solid shapes.
*/
