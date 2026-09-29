// a small 3D level that starts in the 3D level editor: place boxes, lights
// and coins, then press Play or Escape to walk around, and Escape again
// to go back to editing; the level is autosaved as you go

let player, playerStart = vec3(0, 2, 6), score = 0;

// the level as plain data, the editor edits it in place and saves it;
// a color in a level is a hex string, written here from its hsl
const color = (h, s, l)=> hsl(h, s, l).toString(false);
const level = {littlejs3D: 1, objects: [
    {id: 1, type: 'Box', pos: [0, -.5, 0], scale: [16, 1, 16],
        properties: {color: color(.3, .3, .4)}},
    {id: 2, type: 'Box', pos: [-3.5, 1, -2.5], scale: [1, 2, 5],
        properties: {color: color(.08, .4, .5)}},
    {id: 3, type: 'Box', pos: [3, .5, -3], scale: [2, 1, 2],
        properties: {color: color(.65, .3, .6)}},
    {id: 4, type: 'Coin', pos: [3, 2, -3]},
    {id: 5, type: 'Coin', pos: [-1.5, 1, 1.5]},
    {id: 6, type: 'Light', pos: [0, 4, 0],
        properties: {color: color(.1, 1, .7), radius: 12}},
    {id: 7, type: 'PlayerStart', pos: [0, 2, 6]},
]};

class Coin extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.sphereMesh, undefined, hsl(.15, 1, .5));
        this.scale3D = vec3(.6, .6, .15); // a disc
        this.emissive = .5;
    }

    update()
    {
        this.rotation3D.y += .05;
        if (player && player.pos3D.distance(this.pos3D) < 1)
        {
            ++score;
            this.destroy();
        }
    }
}

// build the level from its data, and again when the editor restarts it
function loadLevel()
{
    engineObjectsDestroy();
    level3DLoad(level);
    player = new FirstPersonCamera3D(playerStart, 0, 0);
    player.size3D = vec3(.6, 1.6, .6); // a body, so the boxes stop it
    player.eyeHeight = .6;
    player.setCollision();
    score = 0;
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6, .5, .4), hsl(.6, .5, .8));
    render3D.gravity.y = -.01;

    // the object types, by the names they have in the level; Box, Sphere,
    // Cylinder and Light are built in
    level3DAddType('Coin', Coin);
    level3DAddType('PlayerStart', (pos)=> playerStart = pos);
    loadLevel();

    // the editor opens with the game's view, so look at the level
    render3D.camera.pos = vec3(0, 7, 13);
    render3D.camera.lookAt(vec3(0, 0, 0));

    // start in the level editor, its Restart button rebuilds the level,
    // and Play from mouse puts the player where the mouse is
    levelEditor.onRestart = loadLevel;
    levelEditor.onPlayFrom = (pos)=>
    {
        player.pos3D = pos.add(vec3(0, 1, 0));
        player.velocity3D = vec3();
    };
    levelEditor.open();
}

function gameRenderPost()
{
    drawTextScreen('Coins ' + score, vec2(mainCanvasSize.x / 2, 40), 40);
}
