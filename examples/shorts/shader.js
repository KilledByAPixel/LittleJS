const shader = `
void mainImage(out vec4 c, vec2 p)
{
    // normalize coordinates
    vec2 uv = (p - iResolution.xy * .5) / iResolution.y;
    
    // get distance and angle from center
    float dist = length(uv); // not distance, a GLSL function
    float angle = atan(uv.y, uv.x);
    
    // color based on angle and distance
    c.rgb = vec3(
        .5 + .5 * sin(angle + iTime),
        .5 + .5 * sin(angle + iTime * 2.),
        .5 + .5 * sin(dist * 5. - iTime)
    );
    
    // apply glow in center
    c += .1 / (dist + .1);

    // apply sine wave brightness
    c *= .5 + .5 * sin(dist * 20. - iTime * 3.);
}
`;

function gameInit()
{
    new PostProcessPlugin(shader);
}

/* info
A picture made by a shader alone: a small program the graphics card runs
for every pixel of the canvas, every frame. This one draws turning
colors with a glow in the middle and rings that move outward. There is
nothing to press.

## How it works
`shader` is a string of GLSL, the language shaders are written in, not
JavaScript. `new PostProcessPlugin(shader)` in `gameInit` hands it to
the post processing plugin, which runs it over the whole canvas after
everything else is drawn. A post process shader normally reads the frame
and changes it. This one never reads it, so what it computes is all
there is to see. The plugin needs WebGL and does nothing without it.

The plugin calls `mainImage(out vec4 c, vec2 p)` once for each pixel:

- `p` is the pixel's position on the canvas, in pixels.
- `c` is the color to write, as red, green, blue and alpha from 0 to 1.
  The plugin sets the alpha to 1 afterwards.
- `iResolution.xy` is the canvas size in pixels and `iTime` is the
  engine's `time`, in seconds.

### The picture
The first line moves the origin to the middle of the canvas and divides
by the height, so `uv.y` runs from `-.5` to `.5` and a circle stays
round whatever the canvas shape. From `uv` come two numbers: `dist`, the
distance from the center, and `angle` around it, which
`atan(uv.y, uv.x)` gives in radians from `-PI` to `PI`.

Each color channel is `.5 + .5 * sin(...)`, which swings between 0 and
1. Red and green follow the angle, so they change around the center, and
turn at different speeds because `iTime` is doubled for green. Blue
follows the distance, so it changes outward.

`c += .1 / (dist + .1)` adds a glow that is 1 at the center and
falls away with distance. The last line multiplies everything by a sine
of the distance, 0 to 1 again, which cuts the picture into rings.
Subtracting `iTime * 3.` makes the rings travel outward.

GLSL does not mix whole numbers and decimals, which is why the numbers
are written `2.` and `5.` with a point.

## Try it
- Change `dist * 20.` to `dist * 40.` for twice as many rings.
- Make the glow stronger: `.1 / (dist + .1)` to
  `.3 / (dist + .1)`.
- In the red line, change `sin(angle + iTime)` to
  `sin(angle * 3. + iTime)`: red repeats three times around the center.

## See also
Post Processing uses the same plugin to bend the picture the game drew,
and Post Effects shows the built in effects. Object Shaders puts a
shader on one sprite in place of the whole screen.
*/
