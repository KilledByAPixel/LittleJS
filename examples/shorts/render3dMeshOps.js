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
Mesh operations: bevels, CSG, mirror and spin. Nine shapes built in code
from boxes, balls and cylinders turn slowly on a checkerboard floor.
Drag to turn the camera and roll the wheel to zoom.

## How it works
The builders make simple shapes, and the operations here turn them into
less simple ones. Everything is built once in `gameInit`.

`show(pos, mesh, color)` at the top puts a mesh in the scene as an
`EngineObject3D`. The object's third argument is a tile, left
`undefined`, so the color comes fourth. `angleVelocity3D` turns it
around the y axis by .01 radians a frame.

### Bevels
The back row is four builders with their bevel arguments.

- `buildBox(size, bevel, bevelSegments)`: the bevel is how much is cut
  from each edge. With 1 segment, the default, the cut is flat, a
  chamfer. `buildBox(1.4, .4, 6)` rounds the edges in 6 steps.
- `buildCylinder` and `buildCone` take
  `(size, height, sides, smooth, capped, bevel, bevelSegments)`. The coin
  is a cylinder 1.6 across and .4 tall with its rims rounded, and the
  cone has its base rim rounded.

### CSG
CSG joins and cuts solid shapes. A mesh has three methods for it, and
each returns a new mesh and leaves both inputs as they were:

- `a.subtract(b)` is `a` with `b` cut out of it.
- `a.union(b)` is everything in either one, as one solid.
- `a.intersect(b)` is only what is in both.

The second argument places `b`: a `vec3` to move it, or a matrix from
`buildMatrix(pos, rotation)` to turn it too.

The wall is a box 3 wide, 2 tall and .4 thick with two boxes cut out, a
doorway and a window. The cutters are 1 deep, more than the wall, so they
go all the way through.

The middle shape takes three steps. `bars` is one cylinder joined to
two turned copies of itself, by a quarter turn of pitch and of roll, so
there is a bar along each axis. A cube intersected with a ball a little
bigger is a cube with its edges and corners rounded off, and subtracting
`bars` drills it three ways.

The last one is a `union` of a box and a ball moved half a unit along
each axis, which makes them one solid with no faces inside.

Both meshes must be closed, as the builders make them, and parts that
overlap must be joined with `union` before a cut. CSG is slow next to the
builders, so do it at load time and not every frame.

### Spin and mirror
`combine(mesh, matrix, color)` is the plain way to put meshes together:
it appends one mesh to another where it is told, and unlike the others
it changes the mesh it is called on. `new Mesh().combine(...)` starts
from an empty mesh.

- `spin(count)` returns `count` copies turned evenly around the y axis.
  The gear is one tooth moved 1 unit out and spun 12 times, joined to a
  disc with `union`, with a hole subtracted from the middle.
- `mirror(axis)` returns the mesh and its mirror image across the plane
  through the origin that faces the axis. `half` is a bar from the origin
  along x with a ball on its end, and mirroring across x makes the other
  half.

## Try it
- Change `buildBox(1.4, .4, 6)` to `buildBox(1.4, .7, 6)`. The bevel is
  half the side, and that rounds the cube into a ball.
- Change `.subtract(bars)` to `.union(bars)` to see the bars.
- Make the doorway wider: `vec3(.8, 1.4, 1)` to `vec3(1.2, 1.4, 1)`.
- Give the gear 8 teeth: `.spin(12)` to `.spin(8)`.
- Show `half` in place of `half.mirror(vec3(1, 0, 0))`.

## See also
3D Shapes shows the builders on their own, and 3D Mesh makes a mesh
from an OBJ or glTF model. `Mesh` in REFERENCE lists the other methods,
`transform`, `setColor` and `scaleUVs` among them.
*/
