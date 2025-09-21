function gameInit()
{
    new PostProcessPlugin(tvShader);
}

function gameRender()
{
    drawRect(vec2(), vec2(99), GRAY);
    drawTile(vec2(), vec2(12), tile(3,128));
}

const tvShader = `
// Simple TV Shader Code
float hash(vec2 p)
{
    p=fract(p*.3197);
    return fract(1.+sin(51.*p.x+73.*p.y)*13753.3);
}
float noise(vec2 p)
{
    vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+1.),u.x),u.y);
}
void mainImage(out vec4 c, vec2 p)
{
    // setup the shader
    p /= iResolution.xy;
    c = texture(iChannel0, p);

    // static noise
    const float staticAlpha = .1;
    const float staticScale = .005;
    c += staticAlpha * hash(floor(p/staticScale) + mod(iTime*500., 1e3));

    // scan lines
    const float scanlineScale = 2.;
    const float scanlineAlpha = .3;
    c *= 1. - scanlineAlpha*cos(p.y*2.*iResolution.y/scanlineScale);

    // black vignette around edges
    const float vignette = 2.;
    const float vignettePow = 6.;
    float dx = 2.*p.x-1., dy = 2.*p.y-1.;
    c *= 1.-pow((dx*dx + dy*dy)/vignette, vignettePow);
}`;