function gameInit()
{
    new PostProcessPlugin(tvShader);
}

function gameRender()
{
    drawRect(vec2(), vec2(99), GRAY);
    drawTile(vec2(sin(time)*3, 0), vec2(12), tile(3,128));
}

const tvShader = `
// Simple TV Shader Code
float hash(vec2 p)
{
    p=fract(p*.3197);
    return fract(1.+sin(51.*p.x+73.*p.y)*13753.3);
}

void mainImage(out vec4 c, vec2 p)
{
    // setup the shader
    vec2 uv = p;
    p /= iResolution.xy;
    c = texture(iChannel0, p);

    // static noise
    const float staticAlpha = .1;
    const float staticScale = .002;
    c += staticAlpha * hash(floor(p/staticScale) + mod(iTime*500., 1e3));

    // scan lines
    const float scanlineScale = 2.;
    const float scanlineAlpha = .5;
    c *= 1. - scanlineAlpha*cos(p.y*2.*iResolution.y/scanlineScale);

    {
        // bloom effect
        const float blurSize = .002;
        const float bloomIntensity = .2;

        // 5-tap Gaussian blur
        vec4 bloom = vec4(0);
        bloom += texture(iChannel0, p + vec2(-2.*blurSize, 0)) * .12;
        bloom += texture(iChannel0, p + vec2(   -blurSize, 0)) * .24;
        bloom += texture(iChannel0, p)                         * .28;
        bloom += texture(iChannel0, p + vec2(    blurSize, 0)) * .24;
        bloom += texture(iChannel0, p + vec2( 2.*blurSize, 0)) * .12;
        bloom += texture(iChannel0, p + vec2(0, -2.*blurSize)) * .12;
        bloom += texture(iChannel0, p + vec2(0,    -blurSize)) * .24;
        bloom += texture(iChannel0, p)                         * .28;
        bloom += texture(iChannel0, p + vec2(0,     blurSize)) * .24;
        bloom += texture(iChannel0, p + vec2(0,  2.*blurSize)) * .12;
        c += bloom * bloomIntensity;
    }

    // black vignette around edges
    const float vignette = 2.;
    const float vignettePow = 6.;
    float dx = 2.*p.x-1., dy = 2.*p.y-1.;
    c *= 1.-pow((dx*dx + dy*dy)/vignette, vignettePow);
}`;