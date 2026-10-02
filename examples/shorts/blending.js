function gameRender()
{
    // additive blending
    setAdditiveBlendMode();
    drawCircle(vec2(-8,-2), 7, hsl(2/3,1,.25));
    drawCircle(vec2(-6, 2), 7, hsl(1/3,1,.5));
    drawCircle(vec2(-4,-2), 7, hsl(0,1,.5));

    // alpha blending
    setAdditiveBlendMode(false);
    drawCircle(vec2(4,-2), 7, hsl(time/9    ,1,.5));
    drawCircle(vec2(8,-2), 7, hsl(time/9+1/3,1,.5,.5));
    drawCircle(vec2(6, 2), 7, hsl(time/9+2/3,1,.5,.5));
}

/* info
Two groups of three overlapping circles. The left group is drawn with
additive blending. The right group is drawn with alpha blending, two of
its circles half see-through, and its colors turn with time. There is
nothing to press.

## How it works
Blending is how a new pixel is combined with what is already drawn
under it.

- **Alpha blending** is the normal mode. The new color covers the old
  one by its alpha: at 1 it replaces it, at `.5` the result is half of
  each.
- **Additive blending** adds the new color to the old one, so a pixel
  can only get brighter. It suits light, fire and glows.

`setAdditiveBlendMode()` turns additive blending on for the draws that
follow, and `setAdditiveBlendMode(false)` goes back to alpha blending.
It is a mode and not an argument of a draw, so it stays on until it is
turned off.

`drawCircle(pos, size, color)` draws a filled circle, and `size` is its
diameter, 7 units here.

`hsl(h, s, l, a)` makes a color from a hue, a saturation, a lightness
and an alpha, each from 0 to 1. The hue goes around the color wheel: 0
is red, `1/3` green and `2/3` blue. The alpha is 1 when left out.

### The left group
Blue, green and red are added together. Red plus green is yellow, which
is the color where those two overlap on a black background. The blue
circle has a lightness of `.25`, half as bright as the others.

### The right group
`time/9` takes the hue once around the wheel every 9 seconds, and a hue
past 1 wraps around. The three hues are a third of the wheel apart. The
first circle has no alpha given, so it is solid. The other two have an
alpha of `.5` and are drawn after it, so what is under them shows
through.

## Try it
- Take out the `setAdditiveBlendMode(false);` line: the right group is
  additive too.
- Change `hsl(2/3,1,.25)` to `hsl(2/3,1,.5)`: with all three at full
  strength, the middle where they all overlap adds up to white.
- Change the alpha in `hsl(time/9+1/3,1,.5,.5)` from `.5` to `.9`: that
  circle hides most of what is under it.

## See also
Colors has more on `hsl`. Particles and Light System use additive
blending for fire and light.
*/
