const timerSound = new Sound([2,0,999,,,,,1.5,,.3,-99,.1,1.63,,,.11]);

function gameInit()
{
    // setup ui system plugin
    new UISystemPlugin();
    uiSystem.defaultCornerRadius = 10;
    uiSystem.defaultShadowColor = BLACK;
    canvasClearColor = hsl(.3,.3,.2);

    // create timer button
    const pos = mainCanvasSize.scale(.5).add(vec2(0, -40));
    timerButton = new UIButton(pos, vec2(200, 90), 'Start');
    timerButton.timer = new Timer;
    timerButton.onClick = ()=>
    {
        timerButton.isSet = true;
        if (timerButton.timer.isSet())
        {
            timerSound.play(0, .5, 2);
            timerButton.timer.unset();
            timerButton.text = 'Start';
        }
        else
        {
            timerSound.play(0, .5, .5);
            timerButton.timer.set(3);
            timerButton.text = 'Stop';
        }
    }

    // create non-interactive slider to display timer
    timerSlider = new UIScrollbar(vec2(0, 100), vec2(400, 50));
    timerSlider.interactive = false;
    timerSlider.update = ()=>
    {
        if (timerButton.isSet && timerButton.timer.elapsed())
        {
            timerSound.play();
            timerButton.isSet = 0;
        }

        // update the timer display
        const t = timerButton.timer.get();
        const timeText = t.toFixed(2) + 's';
        const isSet = timerButton.timer.isSet();
        const setTime = timerButton.timer.getSetTime();
        timerSlider.text = timeText;
        timerSlider.value = setTime ? 1+t/setTime : 1;
        timerSlider.color = isSet ? t < 0 ? CYAN : RED : GRAY;
    }
    timerButton.addChild(timerSlider);
}