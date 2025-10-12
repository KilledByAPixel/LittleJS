let paddle, ball;

class PhysicsObject extends EngineObject
{
    constructor(pos, size)
    {
        super(pos, size); // set object position and size
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
}

function gameInit()
{
    // setup level
    const levelSize = vec2(38, 21);    // size of play area
    cameraPos = levelSize.scale(.5);   // center camera in level
    canvasFixedSize = vec2(1280, 720); // use a 720p fixed size canvas

    // create objects
    paddle = new PhysicsObject(vec2(0,1), vec2(6,1)); // player

    const w = levelSize.x, h = levelSize.y;
    new PhysicsObject(vec2(-.5,h/2),  vec2(1,100)); // left wall
    new PhysicsObject(vec2(w+.5,h/2), vec2(1,100)); // right wall
    new PhysicsObject(vec2(w/2,h+.5), vec2(100,1)); // top wall
}

function gameUpdate()
{
    if (!ball || ball.pos.y < -1) // spawn ball
    {
        ball && ball.destroy(); // destroy old ball
        ball = new PhysicsObject(cameraPos); // create a ball
        ball.velocity = vec2(.2); // give ball some movement
        ball.restitution = 1; // make ball bounce
        ball.mass = 1; // make ball have dynamic physics
    }

    paddle.pos.x = mousePos.x; // move paddle to mouse
}