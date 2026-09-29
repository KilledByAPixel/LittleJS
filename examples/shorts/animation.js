canvasClearColor = GRAY;

// a SpriteAnimation steps a tile through the frames beside it, driven by
// the engine time, so it pauses with the game and needs no update call;
// a SpriteAnimator switches between a character's animations by name
let hero, sweep, oneShot;

class Walker extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(4), hero.tileInfo, 0, hsl(.6,1,.7));
        this.velocity = vec2(.05, 0);
    }
    update()
    {
        this.tileInfo = hero.tileInfo; // the frame to show now
        if (this.pos.x > 14)
            this.pos.x = -14;
    }
}

function gameInit()
{
    // made once the tiles have loaded
    hero = new SpriteAnimator({
        walk:   new SpriteAnimation(tile(3), 2, .15),         // loops
        morph:  new SpriteAnimation(tile(8), 4, .08).play(), // once
    });
    sweep = new SpriteAnimation(tile(5), 7, .1).pingPong(); // there and back
    oneShot = new SpriteAnimation(tile(8), 4, .2).play();   // once
    new Walker(vec2(-8, 3));
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        oneShot.play(); // from the first frame again
        hero.set('morph', ()=> hero.set('walk')); // then walks on
    }
}

function gameRender()
{
    drawTile(vec2(-6, -3), vec2(4), sweep.tileInfo);
    drawTile(vec2(0, -3), vec2(4), oneShot.tileInfo);
    drawText(oneShot.isDone ? 'click' : 'playing', vec2(0, -6), 1.5);

    // frame math by hand still works for the simple cases
    drawTile(vec2(6, -3), vec2(4), tile(3).frame(time*4%2|0), hsl(0,1,.6));
}
