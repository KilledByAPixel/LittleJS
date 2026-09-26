// values the tweakables panel changes live, change one and see it at once
let ballSize = 1;
let ballBounce = .8;
let ballColor = hsl(.55, .8, .6);
let wind = vec2();
let showTrails = true;

const bounceSound = new Sound([,.2,300,,,.05,,2]);

class Ball extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(ballSize));
        this.velocity = randInCircle(.3);
        this.trail = [];
    }

    update()
    {
        // read the tweaks every frame, so a change shows at once
        this.size = vec2(ballSize);
        this.color = ballColor;
        this.velocity = this.velocity.add(wind);

        // bounce off the edges of the screen
        const edge = getCameraSize().subtract(this.size).scale(.5);
        if (abs(this.pos.x) > edge.x)
        {
            this.pos.x = clamp(this.pos.x, -edge.x, edge.x);
            this.velocity.x *= -ballBounce;
        }
        if (this.pos.y < -edge.y)
        {
            const speed = -this.velocity.y;
            speed > .2 && bounceSound.play(this.pos, speed);
            this.pos.y = -edge.y;
            this.velocity.y = speed * ballBounce;
        }

        // keep the last few places it was for its trail
        this.trail.unshift(this.pos.copy());
        this.trail.length = min(this.trail.length, 20);
    }

    render()
    {
        if (showTrails)
        for (let i = this.trail.length; i--;)
        {
            const p = 1 - i / this.trail.length;
            const color = this.color.scale(1, p * .3);
            drawCircle(this.trail[i], this.size.x * p, color);
        }
        drawCircle(this.pos, this.size.x, this.color);
    }
}

function gameInit()
{
    setGravity(vec2(0, -.01));
    canvasClearColor = hsl(.6, .5, .15);
    for (let i = 20; i--;)
        new Ball(randInCircle(8));

    // show the panel from the start, 9 toggles it while the debug
    // overlay is open, and it is never shown in a release build
    debugTweakables = true;

    // add the values to the panel, a min and max give a slider
    tweakDivider('Balls');
    tweak('ballSize', {min: .2, max: 3});
    tweak('ballBounce', {min: 0, max: 1.2});
    tweak('ballColor');
    tweak('wind', {min: -.005, max: .005});
    tweak('showTrails', {label: 'Trails'});
    tweakDivider('Scene');
    tweak('canvasClearColor', {label: 'Sky Color'});
    tweakButton('Clear Balls', ()=> engineObjectsDestroy());

    // gravity, time scale, camera scale and sound volume
    tweakEngineDefaults();
}

function gameUpdate()
{
    if (mouseWasPressed(0))
        new Ball(mousePos);
}

function gameRenderPost()
{
    drawTextScreen('Click to add balls\nCopy puts changes on the clipboard',
        vec2(mainCanvasSize.x/2, 40), 30);
}
