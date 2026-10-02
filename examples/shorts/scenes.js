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

/* info
Three scenes switched with `setScene`: a title, the game and game over.
Each switch clears the objects, but the stars are persistent and stay.

Click to start, then move the mouse to catch the falling balls with the
paddle. Three missed balls end the game, and a click goes back to the
title. P pauses the game.

## How it works
A scene is a plain object with any of five functions: `enter`, `leave`,
`update`, `render` and `renderPost`. `setScene(scene)` makes one the
current scene, and the scene system calls the current scene's functions
at the matching points of each frame. A title screen, the game and a
game over screen then each keep their own code, with no `if` on a
state variable in `gameUpdate`.

### setScene
A switch does three things, in this order:

1. It calls the old scene's `leave`.
2. It destroys every object that is not `persistent`.
3. It makes the new scene current and calls its `enter`.

So a scene starts with an empty world and never has to clean up after
the one before. It happens at once and can be called from anywhere
except a `leave`: here a click in a scene's `update` does it, and so
does a ball's own `update` when the last life goes.

### The scenes
`titleScene` and `overScene` only wait for a click in `update` and draw
text in `renderPost`.

`gameScene` uses all five:

- `enter` resets the score and lives. The functions are called as
  methods, so `this` is the scene and it can keep its own values, like
  `paddleX` and `spawnTime`.
- `leave` keeps the best score.
- `update` runs after `gameUpdate`, and not while paused. It moves the
  paddle to the mouse and makes a `Ball` every .4 to .9 seconds, by
  comparing `time`, the game's seconds, with the next spawn time.
- `render` runs before the objects are drawn, so the paddle is under
  the balls.
- `renderPost` draws over everything, while paused too, which is how
  the Paused text shows.

`score`, `best` and `lives` are globals, not fields of a scene, since
more than one scene reads them.

### The objects
`Star` sets `this.persistent = true`, which is the flag `setScene`
looks at, so the 80 stars made in `gameInit` drift on through every
switch. A star moves .02 units left each update and `mod` wraps it
around the 40 unit width.

`Ball` starts above the view with a speed downward, and
`super.update()` moves it. It is caught when it is level with the
paddle and within 3 units of its middle, and lost below the view. The
paddle is not an object: the scene keeps its x and draws a rectangle.

### gameInit and pausing
The canvas is fixed at 1280 by 720, which at the default camera scale
shows 40 by 22.5 world units, and the camera is put at the middle of
the 40 by 23 the stars fill. The first `setScene` starts the title.

P is read in `gameUpdatePost` because it still runs while the game is
paused, when `gameUpdate` and the scene's `update` do not. `getScene()`
returns the current scene, so P only works in the game.

## Try it
- Give one life: `lives = 3;` to `lives = 1;`.
- Rain balls: `rand(.4, .9)` to `rand(.1, .2)`.
- Set `this.persistent = true;` to `false`. The stars are gone before
  the title shows, cleared by the first `setScene` in `gameInit`.
- Change `setScene(overScene);` to `setScene(gameScene);`. Setting the
  current scene again restarts it, with no game over screen.

## See also
Pong Game for a paddle and ball made of objects with collision. Timers
for timing with `Timer`. `engineObjectsDestroy` is the engine function
that clears the objects.
*/
