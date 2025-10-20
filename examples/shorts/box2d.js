async function gameInit()
{
    // setup box2d
    await box2dInit();
    mouseJoint = 0;
    gravity.y = -50;
    canvasClearColor = hsl(0,0,.9);
    
    // create ground object
    groundObject = new Box2dStaticObject(vec2(-8));
    groundObject.color = GRAY;
    groundObject.addBox(vec2(100,2));

    // add some random objects
    for (let i=50; i--;)
    {
        const pos = randInCircle(5);
        const color = randColor();
        const o = new Box2dObject(pos, vec2(), 0, 0, color);
        randInt(2) ? o.addCircle(rand(1,2)) : o.addRandomPoly(rand(1,2));
    }
}

function gameUpdate()
{
    // mouse controls
    if (mouseJoint)
    {
        // update mouse joint
        mouseJoint.setTarget(mousePos);
        if (mouseWasReleased(0))
        {
            // release object
            mouseJoint = mouseJoint.destroy();
        }
    }
    else if (mouseWasPressed(0))
    {
        // grab object
        const object = box2d.pointCast(mousePos);
        if (object)
            mouseJoint = new Box2dTargetJoint(object,
                groundObject, mousePos);
    }
}

function gameRenderPost()
{
    // draw mouse joint
    mouseJoint && drawLine(mousePos, mouseJoint.getAnchorB(), .2, RED);
}