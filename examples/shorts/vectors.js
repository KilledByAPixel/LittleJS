// helper to draw an arrow from origin along v
function drawArrow(origin, v, color=WHITE)
{
    const tip = origin.add(v);
    drawLine(origin, tip, .12, color);
    drawCircle(tip, .25, color);
}

function gameRender()
{
    const a = vec2(0, 2).rotate(time); // rotating vector
    const b = vec2(2, 0);              // fixed vector

    // addition: chain head to tail
    let o = vec2(-7, 3);
    drawText('a + b', o.add(vec2(0,3)));
    drawArrow(o, a, RED);
    drawArrow(o.add(a), b, GREEN);
    drawArrow(o, a.add(b), YELLOW);

    // lerp: interpolate between two vectors
    o = vec2(7, 3);
    drawText('a.lerp(b, t)', o.add(vec2(0,3)));
    drawArrow(o, a, RED);
    drawArrow(o, b, GREEN);
    drawArrow(o, a.lerp(b, oscillate(.5)), YELLOW);

    // normalize: get a unit vector pointing at the mouse
    o = vec2(-7, -4);
    drawText('toMouse.normalize()', o.add(vec2(0,3)));
    const toMouse = mousePos.subtract(o);
    drawArrow(o, toMouse.normalize().scale(2), CYAN);

    // reflect: bounce a vector across a surface normal
    o = vec2(7, -4);
    drawText('a.reflect(n)', o.add(vec2(0,3)));
    drawLine(o.subtract(vec2(3,0)), o.add(vec2(3,0)), .05, GRAY);
    drawArrow(o, a, RED);
    drawArrow(o, a.reflect(vec2(0,1)), YELLOW);
}
