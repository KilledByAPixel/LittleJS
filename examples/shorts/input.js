function gameUpdate()
{
    touchGamepadEnable = 1;
    if (isTouchDevice || isUsingGamepad)
    {
        if (isTouchDevice)
        {
            debugText('Touch Gamepad Mode', vec2(0,5));

            // touch input is routed to mouse
            debugPoint(mousePos, mouseIsDown(0) ? RED : YELLOW, 1);
        }
        else
        {
            debugText('Gamepad Mode', vec2(0,5));
            debugText('Primary Gamepad: ' + gamepadPrimary, vec2(0,4));
        }

        // analog sticks
        for (let i=2; i--;)
        {
            const stick = gamepadStick(i);
            const pos = vec2(i?3:-3, 1);
            debugCircle(pos, 4, WHITE);
            debugLine(pos, pos.add(stick.scale(2)), GREEN);
        }

        // buttons
        for (let i=16; i--;)
        {
            const pos = vec2(-7 + i%8*2, -3 - (i/8|0)*2);
            if (gamepadIsDown(i))
                debugCircle(pos, 2, RED, 0, 1);
            debugCircle(pos, 2, WHITE);
            debugText(i, pos);
        }
    }
    else
    {
        debugText('Mouse and Keyboard Mode', vec2(0,5));

        // keyboard key (space bar)
        debugRect(vec2(), vec2(4), WHITE);
        if (keyIsDown('Space'))
            debugRect(vec2(), vec2(4), RED, 0, 0, 1);

        // keyboard direction (arrow keys or WASD)
        const inputDirection = keyDirection();
        debugLine(vec2(), inputDirection.scale(2), GREEN);

        // mouse pos
        debugPoint(mousePos, mouseIsDown(0) ? RED : YELLOW, 1);

        // mouse buttons
        for (let i=3; i--;)
        {
            const pos = vec2(-2 + i*2, -5);
            if (mouseIsDown(i))
                debugCircle(pos, 2, RED, 0, 1);
            debugCircle(pos, 2, WHITE);
            debugText(i, pos);
        }
    }
}