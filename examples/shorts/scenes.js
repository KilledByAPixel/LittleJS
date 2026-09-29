// three scenes switched with setScene: a title, the game and game over;
// each switch clears the objects, but the stars are persistent and stay

let score = 0, best = 0, lives = 0;

class Star extends EngineObject
{
    constructor()
    {
        super(vec2(rand(40), rand(23)), vec2(.15), undefined, 0,
            hsl(.6, .4, rand(.5, 1)));
        this.persistent = true; // kept through every scene switch
    }

    update() { this.pos.x = mod(this.pos.x - .02, 40); }
}

class Ball extends EngineObject
{
    constructor()
    {
        super(vec2(rand(2, 38), 24), vec2(1), tile(0), 0,
            hsl(rand(), .8, .6));
        this.velocity.y = -rand(.1, .2);
    }

    update()
    {
        super.update();
        const {x, y} = this.pos; // caught while it overlaps the paddle
        if (y < 1.5 && y > .5 && abs(x - gameScene.paddleX) < 3)
        {
            ++score;
            this.destroy();
        }
        else if (y < -1)
        {
            this.destroy();
            if (!--lives)
                setScene(overScene); // it can switch from anywhere
        }
    }
}

const titleScene =
{
    update()
    {
        if (mouseWasPressed(0))
            setScene(gameScene);
    },
    renderPost()
    {
        const center = mainCanvasSize.scale(.5);
        drawTextScreen('Catch!', center.add(vec2(0, -60)), 100);
        drawTextScreen('Click to start', center.add(vec2(0, 40)), 40);
    },
};

const gameScene =
{
    enter()
    {
        score = 0;
        lives = 3;
        this.paddleX = 20;
        this.spawnTime = time;
    },
    leave() { best = max(best, score); },
    update()
    {
        this.paddleX = mousePos.x; // the paddle stays put while paused
        if (time > this.spawnTime)
        {
            new Ball();
            this.spawnTime = time + rand(.4, .9);
        }
    },
    render()
    {
        // the paddle, drawn under the balls
        const color = hsl(.1, .8, .6);
        drawRect(vec2(this.paddleX, 1), vec2(6, .5), color);
    },
    renderPost()
    {
        const text = `Score ${score}   Lives ${lives}   P to pause`;
        drawTextScreen(text, vec2(mainCanvasSize.x / 2, 40), 40);
        if (paused) // render hooks still draw while paused
            drawTextScreen('Paused', mainCanvasSize.scale(.5), 100);
    },
};

const overScene =
{
    update()
    {
        if (mouseWasPressed(0))
            setScene(titleScene);
    },
    renderPost()
    {
        const center = mainCanvasSize.scale(.5);
        drawTextScreen('Game Over', center.add(vec2(0, -60)), 100);
        const text = `Score ${score}   Best ${best}`;
        drawTextScreen(text, center.add(vec2(0, 40)), 40);
    },
};

function gameInit()
{
    canvasFixedSize = vec2(1280, 720);
    cameraPos = vec2(20, 11.5);
    canvasClearColor = hsl(.65, .5, .1);
    for (let i = 80; i--;)
        new Star();
    setScene(titleScene);
}

function gameUpdatePost()
{
    // P pauses the game, gameUpdatePost still runs while paused
    if (getScene() == gameScene && keyWasPressed('KeyP'))
        setPaused(!paused);
}
