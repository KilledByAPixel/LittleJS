// a Shader's mainImage gives the surface color and the engine lights it,
// or with emissive set to 1 the snippet lights itself from the scene's lights

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
