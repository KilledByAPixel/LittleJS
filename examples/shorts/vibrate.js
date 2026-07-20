function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin;
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.05,.5,.2);
    touchGamepadEnable = 1;

    // create buttons to demo vibrate() and gamepadVibrate()
    const w = 320, h = 80, gap = 20;
    function makeButton(pos, text, onClick)
    {
        pos = pos.multiply(vec2(w+gap, h+gap));
        const button = new UIButton(pos, vec2(w, h), text);
        button.onClick = onClick;
    }

    // device vibration - single pulse (works on most mobile devices)
    makeButton(vec2(0,-2), 'Device: 200ms', ()=> vibrate(200));

    // device vibration - pattern of pulses and pauses
    makeButton(vec2(0,-1), 'Device: Pattern',
        ()=> vibrate([100,50,100,50,300]));

    // gamepad rumble - dual motor (requires connected gamepad)
    makeButton(vec2(-1,0), 'Gamepad: Strong',
        ()=> gamepadVibrate(0, 400, 1, 0));
    makeButton(vec2( 1,0), 'Gamepad: Weak',
        ()=> gamepadVibrate(0, 400, 0, 1));
    makeButton(vec2(0, 1), 'Gamepad: Both',
        ()=> gamepadVibrate(0, 400, 1, 1));

    // stop all vibration
    makeButton(vec2(0, 2), 'Stop', ()=>
    {
        vibrateStop();
        gamepadVibrateStop(0);
    });
}