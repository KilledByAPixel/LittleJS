// each Shader is a mainImage snippet, the engine wraps it and then applies
// the object's color like any other sprite

// burn away by a noise threshold that rises and falls, with a glowing edge
const dissolveShader = new Shader(`
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2)))*4e4); }
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    float edge = sin(iTime*1.5)*.6 + .5;
    float n = noise(floor(localUV*24.)/24.);
    if (n < edge) c = vec4(0);
    else if (n < edge + .1) c.rgb = vec3(1, .6, .1);
}`);

// cycle the hue down the sprite, recolored without a second image
const hueShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    float a = iTime*2. + localUV.y*4.;
    c.rgb *= cos(vec3(a, a + 2.1, a + 4.2))*.5 + .5;
}`);

// scanlines that roll upward, darkening every other band
const scanShader = new Shader(`
void mainImage(out vec4 c, vec2 uv)
{
    c = texture(iChannel0, uv);
    c.rgb *= .6 + .4*step(.5, fract(localUV.y*20. - iTime*3.));
}`);

class ShadedSprite extends EngineObject
{
    constructor(pos, shader, color)
    {
        super(pos, vec2(7), tile(3,128), 0, color);
        this.shader = shader;
    }
}

function gameInit()
{
    new ShadedSprite(vec2(-9, 2), dissolveShader, hsl(0,0,1));
    new ShadedSprite(vec2(0, 2), hueShader, hsl(0,0,1));
    new ShadedSprite(vec2(9, 2), scanShader, hsl(.1,1,.7)); // tinted too
}

function gameRender()
{
    // draws that are not objects use setShader, and setShader() ends it
    setShader(hueShader);
    for (let i = 5; i--;)
    {
        const pos = vec2(i*4.5 - 9, -5);
        drawTile(pos, vec2(3), tile(3,128), hsl(0,0,1), time + i);
    }
    setShader();
}
