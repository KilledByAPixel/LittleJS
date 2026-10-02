// for each pixel, pairs of depths on opposite sides a short way off;
// when both are nearer, it sits in a crease, a flat face has one nearer
// and one farther and stays lit; each pixel turns its pattern a little,
// so what the samples miss shows as fine grain, not as bands
const occlusion = `
void mainImage(out vec4 c, vec2 p)
{
    vec2 uv = p / iResolution.xy;
    vec3 color = texture(iChannel0, uv).rgb;
    float d = sceneDepth(uv), ao = 0.;
    vec2 reach = vec2(.35 * iResolution.y / d) / iResolution.xy;
    float turn = fract(52.98 * fract(dot(p, vec2(.0671, .00584)))) * 6.3;
    for (int i = 0; i < 16; i++)
    {
        float a = float(i) * 2.4 + turn, s = sqrt((float(i) + .5) / 16.);
        vec2 o = vec2(cos(a), sin(a)) * s * reach;
        float near = min(d - sceneDepth(uv + o), d - sceneDepth(uv - o));
        ao += clamp(near * 4., 0., 1.) * smoothstep(1., .3, near);
    }
    float shade = uv.x > .5 ? 1. - ao / 16. : 1.;
    c = vec4(color * shade + step(abs(uv.x - .5), .001), 1);
}`;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.35,.35), hsl(.6,.3,.7), undefined, .4);
    render3D.sunDirection = vec3(-.6,1,.4);
    render3D.depthTexture = true; // draw the depth for the post process
    new CameraControl3D(vec3(0,1,-1), 13, .5, .002);

    const stone = hsl(.08,.15,.65);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 1, hsl(.1,.1,.55)));
    const box = (pos, size)=>
    {
        const o = new EngineObject3D(pos, render3D.boxMesh, undefined, stone);
        o.scale3D = size;
    };

    // a wall with stairs up it, boxes stacked in a corner, and an arch
    box(vec3(0,1.5,-4), vec3(12,3,1));
    for (let i = 0; i < 5; ++i)
        box(vec3(-5 + i*.8, .25 + i*.25, -3), vec3(.8, .5 + i*.5, 1));
    box(vec3(4,.5,-3), vec3(1)), box(vec3(5,.5,-3), vec3(1));
    box(vec3(4.5,1.5,-3), vec3(1)), box(vec3(5.5,.5,-2), vec3(1));
    for (const x of [-1, 1])
        box(vec3(x,1,0), vec3(.5,2,.5));
    box(vec3(0,2.2,0), vec3(2.5,.4,.6));

    // a ring lying on the floor
    new EngineObject3D(vec3(3.5,.25,1.5), buildTorus(2,.5,24,12), undefined,
        stone);

    new PostProcessPlugin(occlusion);
}

function gameRenderPost()
{
    const y = mainCanvasSize.y - 40, x = mainCanvasSize.x/4;
    drawTextScreen('plain', vec2(x, y), 30, WHITE, 4);
    drawTextScreen('ambient occlusion', vec2(x*3, y), 30, WHITE, 4);
}

/* info
Ambient occlusion from the depth texture: a post process darkens the
creases and corners, where nearby things block the light from around.
The left half is plain, the right half has it.
*/
