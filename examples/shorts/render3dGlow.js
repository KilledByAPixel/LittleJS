// the post processing plugin runs over the 3D scene too, here a bloom that spreads the bright parts
const bloomShader = `
void mainImage(out vec4 color, vec2 pixel)
{
    vec2 uv = pixel / iResolution.xy;
    color = texture(iChannel0, uv);

    // add up what is brighter than the cutoff in a ring around this pixel
    vec3 glow = vec3(0);
    for (int i = 0; i < 12; ++i)
    {
        float a = float(i) * 3.14159 / 6.;
        vec2 offset = vec2(cos(a), sin(a)) * 7. / iResolution.xy;
        glow += max(vec3(0), texture(iChannel0, uv + offset).rgb - .6);
    }
    color.rgb += glow / 4.;
}`;

class Orb extends EngineObject3D
{
    constructor(angle, color)
    {
        super(vec3(), buildSphere(1.2, 12, 6, true));
        this.color = color;
        this.orbitAngle = angle;
        this.unlit = true; // its own color, so the bloom has something bright to find
        this.addChild(new Light3D(vec3(), 9, color));
    }
    update()
    {
        const a = this.orbitAngle += .008;
        this.pos3D = vec3(6, 2 + sin(a*3)).rotateY(a);
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    new PostProcessPlugin(bloomShader, true); // true also draws the 2D canvas through the shader
    render3D.setSky(hsl(.7,.5,.1), hsl(.6,.4,.2));
    render3D.lightColor = hsl(.6,.3,.2);
    render3D.ambientColor = hsl(.6,.3,.15);
    render3D.smoothShading = true;

    // a dark floor and pillars for the orbs to light up
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, hsl(.6,.2,.3)));
    const pillar = buildCylinder(1.4, 5, 12).setColor(hsl(.6,.2,.4));
    for (let i = 6; i--;)
        new EngineObject3D(vec3(11, 2.5).rotateY(i/6*2*PI), pillar);
    for (let i = 4; i--;)
        new Orb(i*PI/2, hsl(i/4,1,.6));
}

function gameUpdate()
{
    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,2,0), 20, orbit, .25);
}
