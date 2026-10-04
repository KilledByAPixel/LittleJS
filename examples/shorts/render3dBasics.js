let title, light;

function gameInit()
{
    // setup the 3D rendering environment
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.ambientColor = hsl(.6,.2,.3);
    new CameraControl3D(vec3(0,1,0), 15, .3);

    // a checkerboard floor
    const checker = (x, z)=> hsl(.6, .1, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, checker));

    // extruded text from the engine font
    const textMesh = buildText3D('LITTLEJS 3D', 2, 1);
    title = new EngineObject3D(vec3(0,4,-2), textMesh);
    title.color = hsl(.1,1,.6);

    // cube and sphere, sized with scale3D
    const cube = new EngineObject3D(vec3(-4,1.5,3), render3D.boxMesh);
    cube.scale3D = vec3(3);
    cube.color = hsl(.55,.8,.6);
    cube.angleVelocity3D = vec3(0, .01, 0);
    const ball = new EngineObject3D(vec3(4,1.5,3), render3D.sphereMesh);
    ball.scale3D = vec3(3);
    ball.color = hsl(.95,.8,.6);
    ball.specular = 1;

    // a point light that circles the scene, with a glowing bulb
    light = new Light3D(vec3(), 12, hsl(.1,1,.6), 2);
    const bulb = new EngineObject3D(vec3(), render3D.sphereMesh);
    bulb.scale3D = vec3(.5);
    bulb.color = hsl(.1,1,.7);
    bulb.emissive = 1;
    bulb.castShadow = false;
    light.addChild(bulb);
}

function gameUpdate()
{
    title.rotation3D = vec3(0, sin(time)*.2, 0);
    light.pos3D = vec3(8, 3, 0).rotateY(time);
}

/* info
A first 3D scene: a checkerboard floor, extruded text, a cube and a
shiny ball, lit by the sun with shadows and by a small orange light that
circles them. Drag to turn the camera and roll the wheel to zoom.

## How it works
3D is a plugin. `new Render3DPlugin` turns it on and makes `render3D`,
which holds the scene's settings. After that the engine draws 3D objects
the way it draws 2D ones: make an object and it is in the scene.

### The scene
- `render3D.setSky(top, horizon)` makes a sky that goes from one color
  straight up to the other at the horizon, and lights the scene by it.
- `render3D.shadows = true` has the sun cast shadows. They are off by
  default and cost nothing when off.
- `render3D.ambientColor` is the soft light from above, which keeps the
  sides away from the sun from being black. `setSky` took one from the
  sky's top color, and this line replaces it.
- `new CameraControl3D(target, distance, pitch)` is a camera that looks
  at a point, here one unit above the floor from 15 units away and .3
  radians above the horizon. It does the dragging and zooming.

### Objects
`new EngineObject3D(pos3D, mesh)` puts a mesh in the world. A position
is `vec3(x, y, z)` with y up.

- The floor is `buildGrid(size, segments, color)`, 30 units square with
  15 cells a side. The color can be a function called for each cell, and
  `checker` gives every other cell a lighter gray.
- `buildText3D(text, size, depth)` makes a mesh of the text in the
  engine's built in font, here 2 units tall and 1 thick.
- `render3D.boxMesh` and `render3D.sphereMesh` are shared meshes one
  unit across. `scale3D = vec3(3)` makes this cube and ball 3 units
  across, and with their centers at y 1.5 they rest on the floor.
- `color` tints an object, `specular = 1` gives the ball its
  highlight, and `angleVelocity3D` is added to the cube's rotation
  every frame, so it turns around the y axis.

### The light
`new Light3D(pos3D, radius, color, intensity)` is a point light that
fades to nothing at its radius, 12 units here. A light draws nothing
itself, so a small sphere is attached with `addChild` to show where it
is. `emissive = 1` gives the bulb its own color with no shading, and
`castShadow = false` keeps it out of the sun's shadows.

### gameUpdate
`rotation3D` is pitch, yaw and roll in radians, and the title's yaw
swings with `sin(time)`. The light's place is the point `vec3(8,3,0)`
turned around the y axis by `time`: a circle 8 units out and 3 up. The
bulb follows because it is the light's child.

## Try it
- Set `render3D.shadows` to `false` to see what the shadows add.
- Change the text, or its depth from `1` to `.2`.
- Give the cube `specular = 1` too, or the ball `emissive = 1`.
- Make the light's radius `30` and its intensity `4`.
- Add `render3D.sunDirection = vec3(1,.3,0);` to `gameInit` for a low
  sun and long shadows.

## See also
3D Shapes shows more of the mesh builders. 3D Lights, 3D Collision and
3D Drawing each take one part of this further.
*/
