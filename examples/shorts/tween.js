canvasClearColor = hsl(0, 0, .12);

// numeric tween: a box that bounces vertically with ease-out bounce
let bouncerY = 4;

// Vector2 tween: a box that slides diagonally with smooth ease-in-out sine
const slider = { pos: vec2(-3, 1) };

// Color tween: a box that pulses between red and blue
const pulser = { color: RED };

function gameInit()
{
    new Tween((y) => bouncerY = y, 4, -3, 1.5,
        { ease: Ease.OUT(Ease.BOUNCE) }).pingPong();

    tweenProperty(slider, 'pos', vec2(-3, 1), vec2(3, -1), 2,
        { ease: Ease.IN_OUT(Ease.SINE) }).pingPong();

    tweenProperty(pulser, 'color', RED, BLUE, 1).pingPong();
}

function gameRender()
{
    drawText('Tween System', vec2(0, 6.5), 1.5);
    drawRect(vec2(-6, bouncerY), vec2(2), GREEN);
    drawRect(slider.pos,         vec2(2), CYAN);
    drawRect(vec2(6, 0),         vec2(2), pulser.color);
}
