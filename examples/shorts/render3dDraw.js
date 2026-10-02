let torus;

// a point on a ring around the middle, turning slowly
const ring = (i, radius, y)=> vec3(radius, y, 0).rotateY(i/4*PI + time*.3);

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.3), hsl(.6,.4,.7));
    render3D.shadows = true;
    render3D.onRenderOpaque = drawOpaque;
    render3D.onRenderTransparent = drawTransparent;
    new CameraControl3D(vec3(0,2,0), 20, .45, .002);

    // a mesh built once can be drawn immediately too
    torus = buildTorus(3, .8).setColor(hsl(.1,1,.6));
}

function drawOpaque()
{
    // solid things, drawn again from the light for the shadow map
    render3D.drawBox(vec3(0,-.5,0), vec3(24,1,24), hsl(.6,.1,.4));
    const spin = vec3(time, time*.7, 0);
    render3D.drawMesh(torus, buildMatrix(vec3(0,2,0), spin));
    for (let i = 8; i--;)
    {
        const color = hsl(i/8,.6,.6), hop = .5 + abs(sin(time*3 + i))*2;
        render3D.drawBox(ring(i, 7, 1), 1.5, color, vec3(0, time*2 + i, 0));
        render3D.drawSphere(ring(i + .5, 4, hop), 1, color);
    }
}

function drawTransparent()
{
    // blended things: a glow in the middle, lines, and sprites
    render3D.drawSoftDisc(vec3(0,2,0), 5, hsl(.1,1,.7,.6));
    for (let i = 8; i--;)
    {
        render3D.drawLine(vec3(0,2,0), ring(i, 7, 1), .05, hsl(i/8,1,.8));
        render3D.drawBillboard(ring(i, 7, 3), vec2(1.5), tile(i%4, 16));
    }

    // rainbow ribbon, ending where it starts so it forms a loop
    const points = [], widths = [], colors = [];
    for (let i = 0; i <= 60; ++i)
    {
        const t = i/60, a = t*2*PI, r = 12;
        points.push(vec3(cos(a)*r, 2 + sin(a*3 + time)*.8, sin(a)*r));
        widths.push(.5 + .3*sin(a*5 - time*4));
        colors.push(hsl(t + time*.2, 1, .6, .8));
    }
    render3D.drawRibbon(points, widths, undefined, colors);
}

/* info
A 3D scene with no objects in it. Everything is drawn again each frame
with the draw functions of `render3D`, the way `drawRect` and `drawTile`
work in 2D: a floor, a spinning torus, boxes and hopping balls on rings,
a glow, lines, sprites and a rainbow ribbon. Drag to turn the camera and
roll the wheel to zoom.

## How it works
3D draws only work while the 3D pass is running, so they do not go in
`gameRender`. The renderer has two hooks for them, set in `gameInit`:

- `render3D.onRenderOpaque` is for solid things. With
  `render3D.shadows` on it runs a second time each frame, from the
  light, to draw the shadow map. That is why it should only draw.
- `render3D.onRenderTransparent` is for things that blend. They are
  drawn after the solid ones, sorted far to near.

`ring(i, radius, y)` is a helper both use: a point `radius` out and `y`
up, turned around the y axis with `rotateY`. Eight steps of `i` go once
around, and `time*.3` turns the whole ring slowly.

### drawOpaque
- `drawBox(pos, size, color, rotation)` takes the center and the full
  size, a `vec3` or one number for a cube. The floor is a box 24 wide
  and 1 thick, centered half a unit down so its top is at y 0. The
  rotation is pitch, yaw and roll in radians.
- `drawSphere(pos, size, color)` takes a diameter. `hop` is the height
  of a ball's center, `.5` at the lowest, where a ball one unit across
  touches the floor.
- `drawMesh(mesh, matrix, tileInfo, color)` draws any mesh. The torus
  is built once in `gameInit`, since building a mesh every frame would
  be wasted work, and `buildMatrix(pos, rotation)` makes the transform
  that places and turns it.

### drawTransparent
These are all unlit: they show their own colors whatever the light.

- `drawSoftDisc(pos, size, color)` is a disc that fades out at its rim
  and faces the camera, for a glow.
- `drawLine(posA, posB, width, color)` is a line with a width in world
  units.
- `drawBillboard(pos, size, tileInfo, color)` is a tile that always
  faces the camera, a sprite in the 3D world. `tile(i%4, 16)` picks one
  of the first four tiles of the sheet.
- `drawRibbon(points, width, tileInfo, color)` draws a band along a
  path. The width and the color can each be one value or an array with
  one for every point, as here. The loop makes 61 points around a
  circle of radius 12, and the last is the same as the first, so the
  ribbon joins into a loop with no seam.

## Try it
- Set `render3D.shadows` to `false` to see the scene with no shadows.
- Change the ball's size in `drawSphere` from `1` to `2`.
- Change `tile(i%4, 16)` to `tile(3, 128)` for the big logo.
- Make the lines thicker: change `.05` to `.3`.
- Change `r = 12` to `r = 6` to pull the ribbon in.

## See also
3D Basics makes the same kinds of shapes as objects, which is the
better way for things that stay. 3D Billboards has more about sprites,
and 3D Trails a ribbon that follows an object. Look up
`render3D.bake` to turn draw calls into a mesh.
*/
