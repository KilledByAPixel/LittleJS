const shader = `
void mainImage(out vec4 c, vec2 p)
{
    // normalize coordinates
    vec2 uv = (p - iResolution.xy * .5) / iResolution.y;
    
    // get distance and angle from center
    float distance = length(uv);
    float angle = atan(uv.y, uv.x);
    
    // color based on angle and distance
    c.rgb = vec3(
        .5 + .5 * sin(angle + iTime),
        .5 + .5 * sin(angle + iTime * 2.),
        .5 + .5 * sin(distance * 5. - iTime)
    );
    
    // apply glow in center
    c += .1 / (distance + .1);

    // apply sine wave brightness
    c *= .5 + .5 * sin(distance * 20. - iTime * 3.);
}
`;

function gameInit()
{
    new PostProcessPlugin(shader);
}