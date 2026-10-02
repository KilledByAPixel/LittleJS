let player, playerStart, score = 0;

// the level as a Tiled map, the editor edits it in place and saves it
function makeLevel()
{
    const width = 40, height = 12, data = [];
    for (let row = height; row--;) // Tiled lists rows from the top
    for (let x = 0; x < width; ++x)
    {
        const ground = row < 2 || row == 5 && x > 12 && x < 18;
        data.push(ground ? 2 : 0); // a gid is the tile plus one
    }
    const object = (id, type, x, y)=>
        ({id, type, point: true, x: x * 16, y: (height - y) * 16});
    return {width, height, tilewidth: 16, tileheight: 16,
        nextlayerid: 3, nextobjectid: 5, layers: [
            {type: 'tilelayer', id: 1, name: 'Ground', width, height, data},
            {type: 'objectgroup', id: 2, name: 'Objects', objects: [
                object(1, 'PlayerStart', 3.5, 3),
                object(2, 'Coin', 15.5, 7.5),
                object(3, 'Coin', 22.5, 3.5),
                object(4, 'Coin', 26.5, 3.5)]}]};
}
const level = makeLevel();

class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1, 2), undefined, 0, hsl(0, .8, .5));
        this.setCollision();
    }

    update()
    {
        const move = keyDirection(), speed = this.groundObject ? .1 : .01;
        this.velocity.x = clamp(this.velocity.x + move.x * speed, -.3, .3);
        if (this.groundObject && move.y > 0)
            this.velocity.y = .9; // jump
        cameraPos = vec2(this.pos.x, 7);
    }
}

class Coin extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(.8), tile(6), 0, hsl(.15, 1, .5));
        this.mass = 0; // static, it stays where it was placed
        this.value = 1;
    }

    update()
    {
        if (player && player.pos.distance(this.pos) < 1)
        {
            score += this.value;
            this.destroy();
        }
    }
}

// build the level from the map, and again when the editor restarts it
function loadLevel()
{
    engineObjectsDestroy();
    tileLayersLoad(level, tile(0, 16), 0, 0); // layer 0 has collision
    objectLayersLoad(level);
    player = new Player(playerStart);
    score = 0;
}

function gameInit()
{
    gravity.y = -.05;
    canvasClearColor = hsl(.6, .4, .6);
    cameraPos = vec2(10, 6); // the editor opens looking at the level

    // the object types, by the names they have in the map, with icons
    objectLayersAddType('PlayerStart', (pos)=> playerStart = pos, {},
        tile(3));
    objectLayersAddType('Coin', Coin, {value: 1}, tile(6));
    loadLevel();

    // start in the level editor, its Restart button rebuilds the level,
    // and Play from mouse, in its Advanced section, puts the player there
    levelEditor.onRestart = loadLevel;
    levelEditor.paletteTiles = [0, 1, 10]; // the level tiles of the sheet
    levelEditor.onPlayFrom = (pos)=>
    {
        player.pos = pos.copy();
        player.velocity = vec2();
    };
    levelEditor.open();
}

function gameRenderPost()
{
    drawTextScreen('Coins ' + score, vec2(mainCanvasSize.x / 2, 40), 40);
}

/* info
A tiny platformer that starts in the level editor. Paint ground, place
coins and the player start, then press Play or Escape to try it, and
Escape again to go back to editing. The level is autosaved as you go.
*/
