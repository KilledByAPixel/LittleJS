class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(2,4), 0, 0, RED);
        this.setCollision(); // make object collide
    }

    update()
    {
        // apply movement controls
        const moveInput = keyDirection();
        this.velocity.x += moveInput.x * (this.groundObject ? .1: .01);
        if (this.groundObject && moveInput.y > 0)
            this.velocity.y = .9; // jump

        // move camera with player
        cameraPos = vec2(this.pos.x, 9); 
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.05;
    new Player(vec2(5,6));
    canvasClearColor = hsl(.6,.3,.5);

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(256));
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        const levelHeight = pos.x<9 ? 2 : (pos.x/4|0)**3.1%7;
        if (pos.y > levelHeight)
            continue;
        
        // set tile data
        tileLayer.setData(pos, new TileLayerData(1));
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw(); // redraw tile layer with new data
}