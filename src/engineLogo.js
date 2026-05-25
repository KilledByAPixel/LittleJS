/**
 * LittleJS Engine Logo
 * - Draws the LittleJS splash screen logo
 * - Used internally during engine startup
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
function drawEngineLogo(t)
{
    const blackAndWhite = 0;
    const showName = 1;

    // LittleJS Logo and Splash Screen
    const x = mainContext;
    const dpr = canvasPixelRatio ?? (devicePixelRatio || 1);
    const w = mainCanvas.width = innerWidth * dpr;
    const h = mainCanvas.height = innerHeight * dpr;
    {
        // background
        const p3 = percent(t, 1, .8);
        const p4 = percent(t, 0, .5);
        const g = x.createRadialGradient(w/2,h/2,0,w/2,h/2,hypot(w,h)*.6);
        g.addColorStop(0,hsl(0,0,lerp(0,p3/2,p4),p3).toString());
        g.addColorStop(1,hsl(0,0,0,p3).toString());
        x.save();
        x.fillStyle = g;
        x.fillRect(0,0,w,h);
    }
    const gradient = (X1,Y1,X2,Y2,C,S=1)=>
    {
        if (C >= 0)
        {
            if (blackAndWhite)
                x.fillStyle = '#fff';
            else
            {
                const g = x.fillStyle = x.createLinearGradient(X1,Y1,X2,Y2);
                g.addColorStop(0,color(C,2));
                g.addColorStop(1,color(C,1));
            }
        }
        else
            x.fillStyle = '#000';
        C >= -1 ? (x.fill(), S && x.stroke()) : x.stroke();
    }
    const circle = (X,Y,R,A=0,B=2*PI,C,S)=>
    {
        x.beginPath();
        x.arc(X,Y,R,p*A,p*B);
        gradient(X,Y-R,X,Y+R,C,S);
    }
    const rect = (X,Y,W,H,C)=>
    {
        x.beginPath();
        x.rect(X,Y,W,H*p);
        gradient(X,Y+H,X+W,Y,C);
    }
    const poly = (points,C,Y,H)=>
    {
        x.beginPath();
        for (const p of points)
            x.lineTo(p.x, p.y);
        x.closePath();
        gradient(0, Y, 0, Y+H,C);
    }
    const color = (c,l)=> l?`hsl(${[.95,.56,.13][c%3]*360} 99%${[0,50,75][l]}%)`:'#000';

    // center and fit to screen
    const alpha = oscillate(1,1,t);
    const p = percent(alpha, .1, .5);
    const size = min(6, min(w,h)/99);
    x.translate(w/2,h/2);
    x.scale(size,size);
    x.translate(-40,-35);
    p < 1 && x.setLineDash([99*p,99]);
    x.lineJoin = x.lineCap = 'round';
    x.lineWidth = .1 + p*1.9;
    //x.strokeStyle='#fff7';

    if (showName)
    {
        // engine name text
        const Y = 54;
        const s = 'LittleJS';
        x.font = '900 15.5px arial';
        x.lineWidth = .1+p*3.9;
        x.textAlign = 'center';
        x.textBaseline = 'top';
        rect(11,Y+1,59,8*p,-1);
        x.beginPath();

        let w2 = 0;
        for (let i=0;i<s.length;++i)
            w2 += x.measureText(s[i]).width;
        for (let j=2;j--;)
        for (let i=0,X=40-w2/2;i<s.length;++i)
        {
            const w = x.measureText(s[i]).width, X2 = X+w/2;
            gradient(X2,Y,X2+2,Y+13,i>5?1:0);
            x[j?'strokeText':'fillText'](s[i],X2,Y+.5,17*p);
            X += w;
        }

        x.lineWidth = .1 + p*1.9;
        rect(3,Y,73,0); // bottom
    }

    rect(7,15,26,-7,0);   // cab top
    rect(25,15,8,25,-1);  // cab front
    rect(10,40,15,-25,1); // cab back
    rect(14,21,7,9,2);    // cab window
    rect(38,20,6,-6,2);   // little stack

    // big stack
    rect(49,20,10,-6,0);
    const stackPoints = [vec2(44,8),vec2(64,8),vec2(59,8+6*p),vec2(49,8+6*p)];
    poly(stackPoints,2,8,6*p);
    rect(44,8,20,-7,0);

    // engine
    for (let i=5;i--;) circle(59-i*6*p,30,10,0,2*PI,1,0);
    circle(59,30,4,0,7,2); // light

    // engine outline
    rect(35,20,24,0);  // top
    circle(59,30,10);  // front
    circle(47,30,10,PI/2,PI*3/2); // middle
    circle(35,30,10,PI/2,PI*3/2); // back
    rect(7,40,13,7,-1);   // bottom back
    rect(17,40,43,14,-1); // bottom center

    // wheels
    for (let i=3;i--;) for (let j=2;j--;) circle(17+15*i,47,j?7:1,0,2*PI,2);

    // cowcatcher
    for (let i=2;i--;)
    {
        let w=6, s=7, o=53+w*p*i
        const points = [vec2(o+s,54),vec2(o,40),vec2(o+w*p,40),vec2(o+s+w*p,54)];
        poly(points,0,40,14);
    }

    x.restore();
}
