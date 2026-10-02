function gameRender()
{
    // precreate variables to avoid overhead
    const pos = vec2(), size = vec2(), color = hsl();
    for (let i=2e3; i--;)
    {
        // use math to generate random star positions
        const offset = time*(9+i**2.1%15) + i**2.3;
        pos.x = offset%70 - 35;
        pos.y = i/110 - 9;
        size.x = size.y = i%.11 + .07;
        color.set(1,1,1,sin(i)**4);
        drawRect(pos, size, color);
    }
}

/* info
Two thousand stars drifting to the right at different speeds, which
reads as depth. No star is stored anywhere: each one's place is worked
out again every frame from its number and the time. There is nothing
to press.

## How it works
The usual way to do this is a list of star objects that each move a
little every frame. This example keeps no list. A star is only its
number `i`, and a few sums turn that number into a row, a speed, a
size and a brightness that are the same every frame. The only thing
that changes is `time`, the seconds since the engine started.

The sums use `%`, the remainder, on powers of `i`. `i**2.1%15` gives
numbers between 0 and 15 that jump around from one `i` to the next
with no pattern the eye can follow, so they stand in for random
numbers that never change.

- `9+i**2.1%15` is the star's speed, from 9 to 24 world units a
  second.
- `time*speed + i**2.3` is how far it has gone, with `i**2.3` as a
  starting point of its own so the stars do not line up.
- `offset%70 - 35` wraps that distance into the range -35 to 35. A
  star that leaves on the right comes back on the left. The view here
  is 30 units wide, so the wrap happens out of sight.
- `i/110 - 9` spreads the stars from y -9 up to a little above 9.
- `i%.11 + .07` is the size, from `.07` to `.18` of a unit.
- `sin(i)**4` is the alpha, between 0 and 1. The fourth power pulls
  most values toward 0, so a few stars are bright and many are faint.

### Reusing objects
`drawRect(pos, size, color)` needs two vectors and a color. Making
new ones for every star would create six thousand objects a frame for
the browser to clean up. The loop makes one of each before it starts
and writes new values into them. `hsl()` with no arguments is white,
and `color.set(r, g, b, a)` sets red, green, blue and alpha directly.

## Try it
- Change `i=2e3` to `i=200` for a thin field. Only the bottom of the
  view has stars, since the row comes from `i`.
- Send the stars the other way: change `offset%70 - 35` to
  `35 - offset%70`.
- Color them: replace the `color.set` line with
  `color.setHSLA(i/2e3,1,.7,sin(i)**4);`
- Change the `9` in the speed to `0`: the slowest stars almost stop
  and the difference in speed is wider.

## See also
Space Game uses a starfield behind a ship, and Parallax shows layers
that follow the camera. Noise is another way to get values that look
random and stay the same.
*/
