function gameInit()
{
    // create parallax layers
    const levelColor = hsl(rand(), .5, .5);
    for (let i=3; i--;)
    {
        const topColor = levelColor.mutate(.2);
        const bottomColor = levelColor.subtract(CLEAR_WHITE).mutate(.2);
        new ParallaxLayer(topColor, bottomColor, i);
    }
}

class ParallaxLayer extends CanvasLayer
{
    constructor(topColor, bottomColor, depth) 
    {
        const renderOrder = depth;
        const canvasSize = vec2(512, 256);
        super(vec2(), vec2(), 0, renderOrder, canvasSize);
        this.depth = depth;

        // create a gradient for the mountains
        const w = canvasSize.x, h = canvasSize.y;
        for (let i = h; i--;)
        {
            // draw a 1 pixel gradient line on the left side of the canvas
            const p = i/h;
            this.context.fillStyle = topColor.lerp(bottomColor, p);
            this.context.fillRect(0, i, 1, 1);
        }

        // draw random mountains
        const pointiness = .2;  // how pointy the mountains are
        const levelness = .005; // how much the mountains level out
        const slopeRange = 1;   // max slope of the mountains
        const startGroundLevel = h/2;
        let y = startGroundLevel, groundSlope = rand(-slopeRange, slopeRange);
        for (let x=w; x--;)
        {
            // pull slope towards start ground level
            y += groundSlope -= (y-startGroundLevel)*levelness;

            // randomly change slope
            if (rand() < pointiness)
                groundSlope = rand(-slopeRange, slopeRange);

            // draw 1 pixel wide vertical slice of mountain
            this.context.drawImage(this.canvas, 0, 0, 1, h, x, y, 1, h - y);
        }

        // remove gradient sliver from left side
        this.context.clearRect(0,0,1,h);
    
        // make webgl texture
        this.useWebGL(glEnable);
    }

    render()
    {
        const canvasSize = vec2(this.canvas.width, this.canvas.height);
        const viewerPos = mousePos;
        const depth = this.depth
        const distance = 3 + depth;
        const parallax = vec2(.2, .05).scale(depth**2+1);
        const cameraDeltaFromCenter = viewerPos.multiply(parallax);
        const positonOffset = vec2(0, 4-depth*3);
        this.pos = cameraDeltaFromCenter.add(positonOffset)
        this.size = canvasSize.scale(distance/cameraScale);
        super.render();
    }
}