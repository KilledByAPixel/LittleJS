// animated stripes, lit and shadowed like any surface
const stripeShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    float s = step(.5, fract(localUV.x*8. + localUV.y*2. + iTime));
    c = vec4(mix(vec3(.2, .4, 1), vec3(1, .9, .3), s), 1);
}`);

// toon shading: three light bands from the sun, the point lights and the
// shadow map; the black outline is a second mesh, see the hull below
const toonShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    vec3 n = normalize(worldNormal);
    float l = max(dot(n, sunDirection), 0.)*shadow();
    for (int i = 0; i < 8; ++i)
    {
        if (i >= lightCount) break;
        vec3 v = lights[i].xyz - worldPos;
        float a = max(0., 1. - length(v)/lights[i].w);
        l += lightColors[i].a*a*a*max(0., dot(n, normalize(v)));
    }
    l = floor(min(l, 1.)*3.)/3.;
    c = vec4(vec3(.3, .9, .6)*(ambientColor + sunColor*l), 1);
}`);

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.ambientColor = hsl(.6,.3,.3);
    render3D.shadows = true;
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,1,0), 14, .3, .003);

    // the floor and a wall that casts a shadow across both objects
    new EngineObject3D(vec3(), buildGrid(vec2(20), 10, hsl(0,0,.6)));
    const wall = buildBox(vec3(6,4,.5)).setColor(hsl(.05,.6,.6));
    new EngineObject3D(vec3(-1,2,-4), wall);

    // the striped one is lit by the engine, the toon one lights itself
    const striped = new EngineObject3D(vec3(-3,1.5,0), buildSphere(3));
    striped.shader = stripeShader;
    const toon = new EngineObject3D(vec3(3,1.5,0), buildTorus(3, 1));
    toon.shader = toonShader;
    toon.emissive = 1; // the snippet's color is final, no engine lighting

    // the outline: the same mesh pushed out along its normals and turned
    // inside out, so only its far side draws and shows around the edges
    const hull = buildTorus(3, 1);
    hull.points = hull.points.map((p, i)=> p.add(hull.normals[i].scale(.08)));
    const outline = new EngineObject3D(vec3(), hull.flipNormals());
    outline.color = hsl(0,0,0);
    outline.emissive = 1; // flat black
    toon.addChild(outline);

    // a point light that the toon shader reads as lights[0]
    new Light3D(vec3(3,4,3), 8, hsl(.1,1,.6), 2);
}

function gameUpdate()
{
    // spin the objects so the bands and stripes move over them
    for (const o of engineObjects)
        if (o.shader)
            o.rotation3D = vec3(0, time*.5, 0);
}

/* info
Two objects drawn with shaders of their own. A `Shader`'s `mainImage`
gives the surface color and the engine lights it, as the striped ball
shows, or with `emissive` set to 1 the snippet lights itself from the
scene's lights, as the toon shaded ring does. Drag to turn the camera
and roll the wheel to zoom.

## How it works
A `Shader` is made from a piece of GLSL, the language that runs on the
graphics card for every pixel of a surface. The piece defines
`void mainImage(out vec4 c, vec2 uv)` and writes the pixel's color to
`c`. The plugin wraps it in its own program, so the snippet can use
names the engine fills in. Make each `Shader` once, as these two are at
the top of the file, and set it on an object with `obj.shader`.

### stripeShader
`localUV` is the mesh's own texture coordinate, and `iTime` is the time
in seconds. On a sphere `localUV.x` goes from 0 to 1 once around it and
`localUV.y` from 0 at the top to 1 at the bottom. `fract` keeps the
part after the point of `localUV.x*8. + localUV.y*2. + iTime`, which
goes from 0 to 1 eight times around the ball, slanted by the y term and
moving with time.
`step(.5, ...)` turns that into 0 or 1, and `mix` picks blue or yellow
by it. GLSL numbers need their point, so 8 is written `8.`.

This snippet only says what color the surface is. The engine then
applies its lighting, shadows and fog to that color, as it does to a
texture.

### toonShader
This one does the lighting itself, to cut it into flat bands.

- `worldNormal` is the way the surface faces and `sunDirection` points
  toward the sun, so their `dot` is how directly the sun hits, 1 face
  on and 0 edge on. `shadow()` is 0 to 1 from the shadow map, 0 in
  shadow.
- The loop adds the point lights. `lights[i].xyz` is a light's position
  and `.w` its radius, `worldPos` is the pixel's place in the world, and
  `lightColors[i].a` is the light's brightness. `a` falls from 1 at the
  light to 0 at its radius. The engine uses at most 8 lights, and
  `lightCount` says how many there are.
- `floor(min(l, 1.)*3.)/3.` rounds the light down to a step of a third,
  which makes the bands.
- The last line multiplies a green by `ambientColor + sunColor*l`.

With `toon.emissive = 1` the engine skips its own lighting and the
snippet's color is final. Without it the banded color would be lit a
second time.

### The outline
The black edge is not in the shader. It is a second torus whose points
are moved .08 units out along their normals, then turned inside out
with `flipNormals`. Back faces are not drawn, so of an inside out mesh
only the far side shows, and it shows where it sticks out around the
ring in front of it. It is flat black with `emissive = 1`, and as a
child of the ring it turns with it.

### The scene
`render3D.smoothShading = true` makes the builders after it give smooth
normals. `buildSphere(3)` is 3 units across, and `buildTorus(3, 1)` is
3 across with a tube 1 thick. The wall is a plain box behind the two,
and the `Light3D` is the one the toon shader reads as `lights[0]`.
`gameUpdate` turns every object that has a `shader` by setting the yaw
of its `rotation3D` from `time`.

## Try it
- More stripes: change `localUV.x*8.` to `localUV.x*20.`.
- Two bands of light: change both `3.` in the `floor` line to `2.`.
- A thick outline: `scale(.08)` to `scale(.25)`.
- Set `toon.emissive` to `0` and see the bands lit again by the engine.

## See also
Object Shaders does the same in 2D, and Post Processing puts a shader
over the whole screen. 3D Materials shows what the built in shader can
do with no snippet. Look up `Shader` for the names a snippet can use.
*/
