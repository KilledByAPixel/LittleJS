function gameRender()
{
    // color constants
    drawRect(vec2(-8, 5), vec2(3), RED);
    drawRect(vec2(-4, 5), vec2(3), YELLOW);
    drawRect(vec2(-0, 5), vec2(3), GREEN);
    drawRect(vec2( 4, 5), vec2(3), BLUE);
    drawRect(vec2( 8, 5), vec2(3), WHITE);
    
    // rgb and hsl color
    drawRect(vec2(-8, 0), vec2(3), new Color(1,0,0));
    drawRect(vec2(-4, 0), vec2(3), rgb(0,1,1));
    drawRect(vec2(-0, 0), vec2(3), hsl(0,1,.5, .5));
    drawRect(vec2( 4, 0), vec2(3), hsl(.6,.5,.5));
    drawRect(vec2( 8, 0), vec2(3), hsl(0,0,1));

    // color lerping
    for (let i=5; i--;)
    {
        const color1 = RED;
        const color2 = YELLOW;
        const color = color1.lerp(color2, i/4);
        drawRect(vec2(-8+i*4, -5), vec2(3), color);
    }
}

/* info
Three rows of colored squares, one for each way to get a color: the
named constants, colors made from numbers, and colors blended from two
others. There is nothing to press.

## How it works
A color is a `Color` object with four numbers from 0 to 1: `r`, `g` and
`b` for red, green and blue, and `a` for alpha, where 1 is solid and 0
is fully see through. Each square is one `drawRect(pos, size, color)`.

### The top row: constants
`RED`, `YELLOW`, `GREEN`, `BLUE` and `WHITE` are colors the engine has
ready. There are more, `BLACK`, `GRAY`, `ORANGE`, `CYAN`, `PURPLE` and
`MAGENTA` among them. They are shared, so do not change one: take a
`copy()` first.

### The middle row: from numbers
- `new Color(1,0,0)` gives red, green and blue directly. Alpha is 1 when
  it is left out.
- `rgb` is a short way to write the same thing, and `0,1,1` is cyan.
  It is here to show it exists: the other examples use `hsl`, which is
  the one that is easier to adjust by hand.
- `hsl(h, s, l, a)` makes a color from a hue, a saturation and a
  lightness. The hue goes once around the color wheel from 0 to 1, with
  red at 0. Saturation is how strong the color is, 0 for gray.
  Lightness goes from black at 0 to white at 1, with the full color at
  `.5`.
- `hsl(0,1,.5, .5)` is full red with an alpha of `.5`, so the background
  shows through it.
- `hsl(.6,.5,.5)` is a blue at half strength, and `hsl(0,0,1)` is white:
  at a lightness of 1 the hue and saturation make no difference.

### The bottom row: blending
`color1.lerp(color2, percent)` returns a new color part of the way from
one to the other: `color1` at 0, `color2` at 1, and the percent is
clamped to that range. The loop counts `i` down from 4 to 0, so `i/4`
gives five even steps and the squares go from red on the left to yellow
on the right. The blend is of the red, green, blue and alpha numbers,
each on its own.

## Try it
- Change `const color2 = YELLOW;` to `BLUE`. The squares between pass
  through purple.
- Change `hsl(.6,.5,.5)` to `hsl(time/5,.5,.5)` and the square goes
  around the color wheel once every 5 seconds.
- Change `hsl(0,1,.5, .5)` to `hsl(0,1,.5, 1)` to make that square
  solid.
- Change `i/4` to `i/8` to stop the blend half way.

## See also
Shapes for the other things to draw in these colors, and Blending for
additive color. `randColor` picks a color at random between two others,
as Camera Mouse Drag does.
*/
