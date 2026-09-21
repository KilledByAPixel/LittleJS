// immediate mode: nothing is kept, everything here is drawn fresh each frame
// from the two render callbacks, the 3D version of drawing in gameRender

let torus;

// a point on a ring of eight around the middle, turning slowly
const ring = (i, radius, y)=> vec3(radius, y, 0).rotateY(i/8*2*PI + time*.3);

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.3), hsl(.6,.4,.7));
    render3D.shadows = true;
    render3D.onRenderOpaque = drawSolid;
    render3D.onRenderTransparent = drawSeeThrough;
    new CameraControl3D(vec3(0,2,0), 20, .45, .002);

    // a mesh built once can be drawn immediately too
    torus = buildTorus(3, .8).setColor(hsl(.1,1,.6));
}

function drawSolid()
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

function drawSeeThrough()
{
    // blended things: a glow in the middle, a line and a sprite at each box
    render3D.drawSoftDisc(vec3(0,2,0), 5, hsl(.1,1,.7,.6));
    for (let i = 8; i--;)
    {
        render3D.drawLine(vec3(0,2,0), ring(i, 7, 1), .05, hsl(i/8,1,.8,.6));
        render3D.drawBillboard(ring(i, 7, 3), vec2(1.5), tile(i%4, 16));
    }

    // rainbow ribbon, ending where it starts so it closes into a loop
    const points = [], widths = [], colors = [];
    for (let i = 0; i <= 60; ++i)
    {
        const t = i/60, a = t*2*PI;
        points.push(vec3(cos(a)*10, 2 + sin(a*3 + time*2)*.8, sin(a)*10));
        widths.push(.5 + .3*sin(a*5 - time*4));
        colors.push(hsl(t + time*.2, 1, .6, .8));
    }
    render3D.drawRibbon(points, widths, colors);
}
