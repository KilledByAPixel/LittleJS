function show(pos, mesh, color)
{
    const o = new EngineObject3D(pos, mesh, undefined, color);
    o.angleVelocity3D = vec3(0, .01, 0);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky();
    render3D.shadows = true;
    new CameraControl3D(vec3(0, 1, 0), 10, .45, .003);

    // checkerboard floor
    const checker = (x, z)=> hsl(.6, .1, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, checker));

    // bevels: a chamfered box, a rounded box, a coin and a cone
    show(vec3(-4.5, 1, -3), buildBox(1.4, .3), hsl(0, .7, .6));
    show(vec3(-1.5, 1, -3), buildBox(1.4, .4, 6), hsl(.1, .7, .6));
    show(vec3(1.5, 1, -3), buildCylinder(1.6, .4, 24, true, true, .12, 4),
        hsl(.15, .8, .55));
    show(vec3(4.5, 1, -3), buildCone(1.4, 1.6, 24, true, true, .25, 4),
        hsl(.3, .6, .5));

    // a wall with a doorway and a window cut out
    const wall = buildBox(vec3(3, 2, .4))
        .subtract(buildBox(vec3(.8, 1.4, 1)), vec3(-.6, -.3, 0))
        .subtract(buildBox(vec3(.7, .6, 1)), vec3(.8, .3, 0));
    show(vec3(-4, 1.2, 0), wall, hsl(.08, .3, .6));

    // the classic: a cube and a ball, three bars joined then drilled through
    const bar = buildCylinder(.7, 3, 16);
    const turn = (pitch, roll)=> buildMatrix(vec3(), vec3(pitch, 0, roll));
    const bars = bar.union(bar, turn(PI/2, 0)).union(bar, turn(0, PI/2));
    const classic = buildBox(1.6).intersect(buildSphere(2.1, 24, 12))
        .subtract(bars);
    show(vec3(0, 1.2, 0), classic, hsl(.55, .6, .6));

    // a union: a box and a ball melted together
    const blob = buildBox(1.2, .1, 2)
        .union(buildSphere(1.3, 24, 12), vec3(.5, .5, .5));
    show(vec3(4, 1, 0), blob, hsl(.8, .5, .6));

    // spin: a gear, teeth around a disc and a hole through it
    const tooth = buildBox(vec3(.3, .4, .4), .05);
    const teeth = new Mesh().combine(tooth, vec3(1, 0, 0)).spin(12);
    const gear = buildCylinder(2, .4, 32).union(teeth)
        .subtract(buildCylinder(.6, 1, 24));
    show(vec3(-2, .5, 3), gear, hsl(.12, .4, .5));

    // mirror: half a dumbbell made whole
    const along = buildMatrix(vec3(.5, 0, 0), vec3(0, 0, PI/2));
    const half = new Mesh().combine(buildCylinder(.3, 1, 16), along)
        .combine(buildSphere(.8, 16, 8), vec3(1, 0, 0));
    show(vec3(2, 1, 3), half.mirror(vec3(1, 0, 0)), hsl(.95, .6, .6));
}

/* info
Mesh operations: bevels, CSG, mirror and spin.
*/
