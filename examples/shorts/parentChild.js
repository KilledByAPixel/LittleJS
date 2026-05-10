class Spinner extends EngineObject
{
    constructor(size, color, spinSpeed)
    {
        super(vec2(), size, 0, 0, color);
        this.spinSpeed = spinSpeed;
    }
    update()
    {
        // rotate self; parent's transform will carry children along
        if (this.parent)
            this.localAngle += this.spinSpeed;
        else
            this.angle += this.spinSpeed;
    }
}

function gameInit()
{
    canvasClearColor = hsl(.6,.3,.1);

    // root: a slow rotating bar at the origin
    const root = new Spinner(vec2(8, .5), YELLOW, .005);

    // child: offset from the root, spins faster on its own axis
    const child = new Spinner(vec2(3, .3), RED, .02);
    root.addChild(child, vec2(4, 0));

    // grandchild: offset from the child, spins fastest
    const grandchild = new Spinner(vec2(1, .2), CYAN, .04);
    child.addChild(grandchild, vec2(1.5, 0));
}

function gameRenderPost()
{
    drawText('Parent / Child Hierarchy', vec2(0, 7), 1.5);
}
