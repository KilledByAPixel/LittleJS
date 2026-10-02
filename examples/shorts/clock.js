function gameRender()
{
    // draw background
    for (let i=12; i--;)
    {
        const a = i/6*PI;
        const pos = vec2(0,7).rotate(a);
        drawRect(pos, vec2(.5,1), hsl(i/12,1,.5), a);
    }

    // get current time
    const d = Date().slice(16,24);
    const s = d.slice(6,8)|0;
    const m = d.slice(3,5)|0;
    const h = (d.slice(0,2)|0) + m/60;

    // draw clock hands
    drawLine(vec2(), vec2(0,4).rotate(h/12*2*PI),  1);
    drawLine(vec2(), vec2(0,6).rotate(m/60*2*PI), .4);
    drawLine(vec2(), vec2(0,8).rotate(s/60*2*PI), .1);
}

/* info
An analog clock that shows the real time of day: twelve colored hour
marks in a ring and three hands. There is nothing to press.

## How it works
Everything is in `gameRender`, which is called once a frame, so the
clock is drawn again from the current time every frame and nothing is
stored.

### The marks
The loop runs `i` from 11 down to 0. Angles are in radians, so
`i/6*PI` is `i` twelfths of a full turn, the angle of hour `i`.

`vec2(0,7).rotate(a)` starts with a point 7 units straight up, where
12 is on a clock, and turns it. `rotate` turns clockwise, which is the
way a clock counts, so no sign has to be flipped.

`drawRect(pos, size, color, angle)` draws each mark `.5` wide and 1
tall, and the fourth argument turns it by the same angle so it points
at the center. `hsl(i/12,1,.5)` takes the hue once around the color
wheel over the twelve marks.

### The time
`Date()` called as a plain function returns the date as text, like
`Fri Oct 02 2026 14:05:09 GMT...`. Characters 16 to 23 of it are the
time, `14:05:09`, and `slice` cuts out the hours, minutes and seconds.
`|0` turns each piece of text into a whole number.

The minutes are added to the hour as a fraction, `m/60`, so the hour
hand moves smoothly between the marks and does not jump once an hour.

### The hands
`drawLine(posA, posB, width)` draws a line between two points, white
when no color is given. Each hand goes from the center, `vec2()`, to a
point turned the same way as the marks: `h/12`, `m/60` and `s/60` are
each the fraction of a full turn, and `2*PI` is a full turn. The hands
are 4, 6 and 8 units long and get thinner as they get longer.

## Try it
- Make the second hand red: add `, RED` after its width `.1`. The
  argument after the width is the color.
- Make the second hand sweep and not tick: change the line that sets
  `s` to `const s = (d.slice(6,8)|0) + Date.now()%1e3/1e3;`
- Change the marks' color from `hsl(i/12,1,.5)` to `WHITE`.
- Change the marks' size from `vec2(.5,1)` to `vec2(.2,2)`.

## See also
Shapes for the other draw functions, Vectors for `rotate` and the rest
of the vector math, and Timers for measuring time inside a game.
*/
