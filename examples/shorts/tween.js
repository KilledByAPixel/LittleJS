const slider = { pos: vec2(-3, 1) };
const pulser = { color: RED };
let bouncerY = 4;

function gameInit()
{
    // tween using the Tween class directly
    new Tween((y) => bouncerY = y, 4, -3, 1.5,
        { ease: Ease.OUT(Ease.BOUNCE) }).pingPong();

    // tweens using tweenProperty helper
    tweenProperty(slider, 'pos', vec2(-3, 1), vec2(3, -1), 2,
        { ease: Ease.IN_OUT(Ease.SINE) }).pingPong();

    // tween using built in color class
    tweenProperty(pulser, 'color', RED, BLUE, 1).pingPong();
}

function gameRender()
{
    drawRect(vec2(-6, bouncerY), vec2(2), GREEN);
    drawRect(slider.pos,         vec2(2), CYAN);
    drawRect(vec2(6, 0),         vec2(2), pulser.color);
}