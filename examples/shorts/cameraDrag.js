function gameInit()
{
    // create some objects
    for (let i=500; i--;)
    {
        const pos = randInCircle(100);
        const size = vec2(rand(2,9),rand(2,9));
        const color = randColor();
        const angle = rand(PI);
        new EngineObject(pos, size, 0, angle, color);
    }
}

function gameUpdate()
{
    // drag camera with mouse
    if (mouseIsDown(0))
        cameraPos = cameraPos.subtract(mouseDelta);

    // zoom camera with mouse wheel
    cameraScale = clamp(cameraScale*(1-mouseWheel/5), 1, 1e3);
}