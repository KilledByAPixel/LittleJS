function gameUpdate()
{
    if (isUsingGamepad)
    {
        debugText('Gamepad Mode', vec2(0,4));

        // analog sticks
        for (let i=2; i--;)
        {
            const stick = gamepadStick(i);
            const pos = vec2(i?2:-2, 1);
            debugCircle(pos, 2, WHITE);
            debugLine(pos, pos.add(stick), GREEN);
        }

        // buttons
        for (let i=16; i--;)
        {
            const pos = vec2(-1.5 + i%4, -2 - (i/4|0));
            if (gamepadIsDown(i))
                debugCircle(pos, 1, RED, 0, 1);
            debugCircle(pos, 1, WHITE);
            debugText(i, pos, .5);
        }
    }
    else if (isTouchDevice)
    {
        debugText('Touch Mode', vec2(0,4));

        // touch input routed to mouse
        if (mouseIsDown(0))
            debugCircle(mousePos, 4, RED, 0, 1);
        debugCircle(mousePos, 4, WHITE);
    }
    else
    {
        debugText('Mouse and Keyboard Mode', vec2(0,4));

        // keyboard key (space bar)
        debugRect(vec2(), vec2(2), WHITE);
        if (keyIsDown('Space'))
            debugRect(vec2(), vec2(2), RED, 0, 0, 1);

        // keyboard direction (arrow keys or WASD)
        const inputDirection = keyDirection();
        debugLine(vec2(), inputDirection, GREEN);

        // mouse pos
        debugPoint(mousePos, mouseIsDown(0) ? RED : YELLOW);

        // mouse buttons
        for (let i=3; i--;)
        {
            const pos = vec2(-1 + i, -3);
            if (mouseIsDown(i))
                debugCircle(pos, 1, RED, 0, 1);
            debugCircle(pos, 1, WHITE);
            debugText(i, pos, .5);
        }
    }
}