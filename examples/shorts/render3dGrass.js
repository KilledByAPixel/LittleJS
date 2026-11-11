let field, windStrength = .3;

// the grass's vertex shader: wind is a uniform the game sets each frame,
// instanceData is each blade's own four numbers from setDataAt
const grassShader = new Shader('', `
void mainVertex(inout vec3 pos, inout vec3 normal)
{
    // the root stays put and the tip bends, a soft blade more
    float bend = pos.y * pos.y * instanceData.y;
    // how far along the way the wind blows, with fronts that curve
    float strength = length(wind);
    vec2 dir = strength > 0. ? wind / strength : vec2(1, 0);
    vec2 side = vec2(-dir.y, dir.x);
    float along = dot(pos.xz, dir) + 2. * sin(dot(pos.xz, side) * .2);
    // a gust is a wave that rolls downwind, so blades near each other
    // lean together, and each blade flutters a little on its own
    float gust = .5 + .5 * sin(along * .4 - iTime * 2.);
    float flutter = .1 * sin(iTime * 6. + instanceData.x);
    pos.xz += wind * bend * (.3 + 1.3 * gust * gust + flutter);
    // darker toward the root, where less light reaches
    vertexColor.rgb *= .4 + .6 * min(pos.y, 1.);
}`, {wind: vec2()});

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.58, .5, .5), hsl(.58, .4, .85));
    render3D.setFog(15, 30);
    // sharp shadows for thin blades: more pixels over less of the world
    render3D.shadows = true;
    render3D.shadowMapSize = 2048;
    render3D.shadowRange = 20;
    new CameraControl3D(vec3(), 10, .3, .001);

    // the ground
    const ground = new EngineObject3D(vec3(0, -.5, 0), render3D.boxMesh,
        undefined, hsl(.25, .5, .2));
    ground.scale3D = vec3(40, 1, 40);

    // one thin blade, drawn 20000 times in one draw call
    const blade = buildCone(.1, 1, 3);
    field = new InstancedMesh3D(blade, 20000);
    field.shader = grassShader;
    for (let i = 0; i < field.count; ++i)
    {
        const width = rand(.6, 1.2), height = rand(.4, 1.2);
        const pos = vec3(rand(-20, 20), height / 2, rand(-20, 20));
        field.setTransformAt(i, pos, vec3(0, rand(PI * 2), 0),
            vec3(width, height, width));
        field.setColorAt(i, hsl(rand(.2, .3), .6, rand(.3, .5)));
        // when it flutters, and how soft it is
        field.setDataAt(i, rand(PI * 2), rand(.5, 1.5), 0, 0);
    }
}

function gameUpdate()
{
    // up and down change the wind, which turns slowly on its own
    windStrength = clamp(windStrength + keyDirection().y * .005, 0, 1);
    const angle = time * .1;
    const wind = vec2(cos(angle), sin(angle)).scale(windStrength);
    grassShader.setUniform('wind', wind);
}

function gameRenderPost()
{
    const text = `wind ${windStrength.toFixed(2)} / up and down change it`;
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
A field of 20000 blades of grass swaying in the wind, every blade one
copy of the same mesh, all drawn in one draw call. Up and down change
the wind, which turns slowly on its own. Drag to turn the camera and
roll the wheel to zoom.

## How it works
The blades never move on the CPU. The game places each one once, and a
vertex shader bends them on the GPU every frame, reading two kinds of
values the game hands it.

### The blades
`buildCone(.1, 1, 3)` is a thin three sided spike, the blade. An
`InstancedMesh3D` keeps 20000 copies of it on the GPU, so they cost
nothing per frame until they change. For each one:

- `setTransformAt` places it, turned at random and scaled to its own
  width and height, with its root on the ground.
- `setColorAt` gives it a shade of green.
- `setDataAt(i, x, y, z, w)` gives it four numbers of the game's own,
  here when it flutters and how soft it is.

### The shader
`new Shader('', vertexCode, uniforms)` has no fragment code, so the
blades keep the 3D look: lighting, shadows and fog. The vertex code
defines `mainVertex`, which gets each vertex's position in world space
and may move it.

- `instanceData` is the blade's four numbers: `x` shifts its flutter
  in time and `y` scales how far it bends.
- `wind` is a uniform, a value the game sets that every blade reads.
  The `{wind: vec2()}` at the end declares it as a `vec2`.
- The ground is at 0, so `pos.y` is how high up the blade a vertex is.
  The bend grows with its square: the root stays put, the tip sways.
- `along` is how far the blade is in the direction the wind blows. The
  gust is a sine wave of it that moves with `iTime`, about 15 units
  from one gust to the next, so blades near each other lean together
  and the gusts are seen rolling over the field. A second sine, across
  the wind, curves their fronts.
- `vertexColor` is the vertex's color, darkened toward the root.

The shadow map runs the same vertex code, so the shadows sway with the
blades.

### The shadows
A blade is about a tenth of a unit wide, so its shadow needs small
shadow map pixels. The map is `shadowMapSize` pixels across a square of
`shadowRange` units that follows the camera: 2048 over 20 units is 100
pixels a unit, four times the default 1024 over 40. Past that square
there are no shadows, but there the grass hides the ground and the fog
takes over.

### The wind
`gameUpdate` turns the wind's direction with `time` and hands it to
the shader with `setUniform('wind', wind)` every frame. A uniform
changes without making the shader again, so this costs almost nothing.

## Try it
- A storm: `windStrength = .3` to `windStrength = 1`.
- Stiffer grass: `rand(.5, 1.5)` to `rand(.1, .3)` in `setDataAt`.
- Gusts that roll across the field faster: `iTime * 2.` to `iTime * 5.`
  in the shader.
- Gusts closer together: `along * .4` to `along * 1.`.
- Taller grass: `rand(.4, 1.2)` to `rand(1, 2)`.
- See the shadows at the default size: remove the two lines that set
  `shadowMapSize` and `shadowRange`.

## See also
3D Instancing draws thousands of cubes in one call, and 3D Shaders
changes how surfaces look with fragment code.
*/
