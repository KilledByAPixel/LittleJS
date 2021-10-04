/*
    LittleJS Debug System
    
    Debug Features
    - debug overlay with mouse pick
    - debug primitive rendering
    - save screenshots
*/

'use strict';

const debug = 1;
const enableAsserts = 1;
const debugPointSize = .5;

let showWatermark = 1;
let godMode = 0;
let debugRects = [];
let debugOverlay = 0;
let debugPhysics = 0;
let debugRaycast = 0;
let debugParticles = 0;
let debugGamepads = 0;
let debugMedals = 0;
let debugCanvas = -1;
let debugTakeScreenshot;
let downloadLink;

// debug helper functions
const ASSERT = enableAsserts ? (...assert)=> console.assert(...assert) : ()=>{};
const debugRect = (pos, size=vec2(0), color='#fff', time=0, angle=0, fill=0)=> 
{
    ASSERT(typeof color == 'string'); // pass in regular html strings as colors
    debugRects.push({pos, size:vec2(size), color, time:new Timer(time), angle, fill});
}
const debugCircle = (pos, radius, color, time=0, fill=0)=>
{
    ASSERT(typeof color == 'string'); // pass in regular html strings as colors
    debugRects.push({pos, size:radius, color, time:new Timer(time), angle:0, fill});
}
const debugPoint = (pos, color, time, angle)=> debugRect(pos, 0, color, time, angle);
const debugLine = (posA, posB, color, thickness=.1, time)=>
{
    const halfDelta = vec2((posB.x - posA.x)*.5, (posB.y - posA.y)*.5);
    const size = vec2(thickness, halfDelta.length()*2);
    debugRect(posA.add(halfDelta), size, color, time, halfDelta.angle(), 1);
}
const debugAABB = (pA, pB, sA, sB, color)=>
{
    const minPos = vec2(min(pA.x - sA.x/2, pB.x - sB.x/2), min(pA.y - sA.y/2, pB.y - sB.y/2));
    const maxPos = vec2(max(pA.x + sA.x/2, pB.x + sB.x/2), max(pA.y + sA.y/2, pB.y + sB.y/2));
    debugRect(minPos.lerp(maxPos,.5), maxPos.subtract(minPos), color);
}

const debugClear = ()=> debugRects = [];

// save a canvas to disk
const debugSaveCanvas = (canvas, filename = engineName + '.png') =>
{
    downloadLink.download = "screenshot.png";
    downloadLink.href = canvas.toDataURL('image/png').replace('image/png','image/octet-stream');
    downloadLink.click();
}

///////////////////////////////////////////////////////////////////////////////
// engine debug function (called automatically)

const debugInit = ()=>
{
    // create link for saving screenshots
    document.body.appendChild(downloadLink = document.createElement('a'));
    downloadLink.style.display = 'none';
}

const debugUpdate = ()=>
{
    if (!debug)
        return;
        
    if (keyWasPressed(192)) // ~
    {
        debugOverlay = !debugOverlay;
    }
    if (keyWasPressed(49)) // 1
    {
        debugPhysics = !debugPhysics;
        debugParticles = 0;
    }
    if (keyWasPressed(50)) // 2
    {
        debugParticles = !debugParticles;
        debugPhysics = 0;
    }
    if (keyWasPressed(51)) // 3
    {
        godMode = !godMode;
    }
        
    if (keyWasPressed(53)) // 5
    {
        debugTakeScreenshot = 1;
    }
    if (keyWasPressed(54)) // 6
    {
        //debugToggleParticleEditor();
        //debugPhysics = debugParticles = 0;
    }
    if (keyWasPressed(55)) // 7
    {
    }
    if (keyWasPressed(56)) // 8
    {
    }
    if (keyWasPressed(57)) // 9
    {
    }
    if (keyWasPressed(48)) // 0
    {
        showWatermark = !showWatermark;
    }

    // asserts to check for things that could go wrong
    ASSERT(gravity <= 0) // only supports downward gravity
}

const debugRender = ()=>
{
    if (debugTakeScreenshot)
    {
        debugSaveCanvas(mainCanvas);
        debugTakeScreenshot = 0;
    }

    if (debugOverlay)
    {
        for (const o of engineObjects)
        {
            if (o.canvas)
                continue; // skip tile layers

            const size = o.size.copy();
            size.x = max(size.x, .2);
            size.y = max(size.y, .2);

            const color = new Color(
                o.collideTiles?1:0, 
                o.collideSolidObjects?1:0,
                o.isSolid?1:0, 
                o.parent ? .2 : .5);

            // show object info
            drawRect(o.pos, size, color);
            drawRect(o.pos, size.scale(.8), o.parent ? new Color(1,1,1,.5) : new Color(0,0,0,.8));
            o.parent && drawLine(o.pos, o.parent.pos, .1, new Color(0,0,1,.5));
        }

        // mouse pick
        let bestDistance = Infinity, bestObject;
        for (const o of engineObjects)
        {
            const distance = mousePos.distanceSquared(o.pos);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                bestObject = o
            }
        }
        
        if (bestObject)
        {
            const raycastHitPos = tileCollisionRaycast(bestObject.pos, mousePos);
            raycastHitPos && drawRect(raycastHitPos.int().add(vec2(.5)), vec2(1), new Color(0,1,1,.3));
            drawRect(mousePos.int().add(vec2(.5)), vec2(1), new Color(0,0,1,.5));
            drawLine(mousePos, bestObject.pos, .1, !raycastHitPos ? new Color(0,1,0,.5) : new Color(1,0,0,.5));

            let pos = mousePos.copy(), height = vec2(0,.5);
            const printVec2 = (v)=> '(' + (v.x>0?' ':'') + (v.x).toFixed(2) + ',' + (v.y>0?' ':'')  + (v.y).toFixed(2) + ')';
            const args = [.5, new Color, .05, undefined, undefined, 'monospace'];

            drawText('pos = ' + printVec2(bestObject.pos) 
                + (bestObject.angle>0?'  ':' ') + (bestObject.angle*180/PI).toFixed(1) + '°', 
                pos = pos.add(height), ...args);
            drawText('vel = ' + printVec2(bestObject.velocity), pos = pos.add(height), ...args);
            drawText('size = ' + printVec2(bestObject.size), pos = pos.add(height), ...args);
            drawText('collision = ' + getTileCollisionData(mousePos), pos = mousePos.subtract(height), ...args);
        }

        glCopyToContext(mainContext);
    }

    {
        // render debug rects
        mainContext.lineWidth = 1;
        const pointSize = debugPointSize * cameraScale;
        debugRects.forEach(r=>
        {
            // create canvas transform from world space to screen space
            const pos = worldToScreen(r.pos);
            
            mainContext.save();
            mainContext.lineWidth = 2;
            mainContext.translate(pos.x|0, pos.y|0);
            mainContext.rotate(r.angle);
            mainContext.fillStyle = mainContext.strokeStyle = r.color;

            if (r.size == 0 || r.size.x === 0 && r.size.y === 0 )
            {
                // point
                mainContext.fillRect(-pointSize/2, -1, pointSize, 3), 
                mainContext.fillRect(-1, -pointSize/2, 3, pointSize);
            }
            else if (r.size.x != undefined)
            {
                // rect
                const w = r.size.x*cameraScale|0, h = r.size.y*cameraScale|0;
                r.fill && mainContext.fillRect(-w/2|0, -h/2|0, w, h),
                mainContext.strokeRect(-w/2|0, -h/2|0, w, h);
            }
            else
            {
                // circle
                mainContext.beginPath();
                mainContext.arc(0, 0, r.size*cameraScale, 0, 9);
                r.fill && mainContext.fill();
                mainContext.stroke();
            }

            mainContext.restore();
        });

        mainContext.fillStyle = mainContext.strokeStyle = '#fff';
    }

    {
        let x = 9, y = -20, h = 30;
        mainContext.fillStyle = '#fff';
        mainContext.textAlign = 'left';
        mainContext.textBaseline = 'top';
        mainContext.font = '28px monospace';
        mainContext.shadowColor = '#000';
        mainContext.shadowBlur = 9;

        if (debugOverlay)
        {
            mainContext.fillText(engineName, x, y += h);
            mainContext.fillText('Objects: ' + engineObjects.length, x, y += h);
            mainContext.fillText('Time: ' + formatTime(time), x, y += h);
            mainContext.fillText('---------', x, y += h);
            mainContext.fillStyle = '#f00';
            mainContext.fillText('~: Debug Overlay', x, y += h);
            mainContext.fillStyle = debugPhysics ? '#f00' : '#fff';
            mainContext.fillText('1: Debug Physics', x, y += h);
            mainContext.fillStyle = debugParticles ? '#f00' : '#fff';
            mainContext.fillText('2: Debug Particles', x, y += h);
            mainContext.fillStyle = godMode ? '#f00' : '#fff';
            mainContext.fillText('3: God Mode', x, y += h);
            mainContext.fillStyle = '#fff';
            mainContext.fillText('5: Save Screenshot', x, y += h);
            //mainContext.fillStyle = debugParticleEditor ? '#f00' : '#fff';
            //mainContext.fillText('6: Particle Editor', x, y += h);
        }
        else
        {
            mainContext.fillText(debugPhysics ? 'Debug Physics' : '', x, y += h);
            mainContext.fillText(debugParticles ? 'Debug Particles' : '', x, y += h);
            mainContext.fillText(godMode ? 'God Mode' : '', x, y += h);
        }
    
        mainContext.shadowBlur = 0;
    }

    debugRects = debugRects.filter(r=>!r.time.elapsed());
}

///////////////////////////////////////////////////////////////////////////////
// particle system editor
let debugParticleEditor = 0, debugParticleSystem, debugParticleSystemDiv, particleSystemCode;

const debugToggleParticleEditor = ()=>
{
    debugParticleEditor = !debugParticleEditor;

    if (debugParticleEditor)
    {
        if (!debugParticleSystem || debugParticleSystem.destroyed)
            debugParticleSystem = new ParticleEmitter(cameraPos);
    }
    else if (debugParticleSystem && !debugParticleSystem.destroyed)
        debugParticleSystem.destroy();


    const colorToHex = (color)=>
    {
        const componentToHex = (c)=>
        {
            const hex = (c*255|0).toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }

        return "#" + componentToHex(color.r) + componentToHex(color.g) + componentToHex(color.b);
    }
    const hexToColor = (hex)=>
    {
        return new Color(
            parseInt(hex.substr(1,2), 16)/255,
            parseInt(hex.substr(3,2), 16)/255,
            parseInt(hex.substr(5,2), 16)/255)
    }

    if (!debugParticleSystemDiv)
    {
        const div = debugParticleSystemDiv = document.createElement('div');
        div.innerHTML = '<big><b>Particle Editor';
        div.style = 'position:absolute;top:10;left:10;color:#fff';
        document.body.appendChild(div);

        for ( const setting of debugParticleSettings)
        {
            const input = setting[2] = document.createElement('input');
            const name = setting[0];
            const type = setting[1];
            if (type)
            {
                if (type == 'color')
                {
                    input.type = type;
                    const color = debugParticleSystem[name];
                    input.value = colorToHex(color);
                }
                else if (type == 'alpha' && name == 'colorStartAlpha')
                    input.value = debugParticleSystem.colorStartA.a;
                else if (type == 'alpha' && name == 'colorEndAlpha')
                    input.value = debugParticleSystem.colorEndA.a;
                else if (name == 'tileSizeX')
                    input.value = debugParticleSystem.tileSize.x;
                else if (name == 'tileSizeY')
                    input.value = debugParticleSystem.tileSize.y;
            }
            else
                input.value = debugParticleSystem[name] || '0';

            input.oninput = (e)=>
            {
                const inputFloat = parseFloat(input.value) || 0;
                if (type)
                {
                    if (type == 'color')
                    {
                        const color = hexToColor(input.value);
                        debugParticleSystem[name].r = color.r;
                        debugParticleSystem[name].g = color.g;
                        debugParticleSystem[name].b = color.b;
                    }
                    else if (type == 'alpha' && name == 'colorStartAlpha')
                    {
                        debugParticleSystem.colorStartA.a = clamp(inputFloat);
                        debugParticleSystem.colorStartB.a = clamp(inputFloat);
                    }
                    else if (type == 'alpha' && name == 'colorEndAlpha')
                    {
                        debugParticleSystem.colorEndA.a = clamp(inputFloat);
                        debugParticleSystem.colorEndB.a = clamp(inputFloat);
                    }
                    else if (name == 'tileSizeX')
                    {
                        debugParticleSystem.tileSize = vec2(parseInt(input.value), debugParticleSystem.tileSize.y);
                    }
                    else if (name == 'tileSizeY')
                    {
                        debugParticleSystem.tileSize.y = vec2(debugParticleSystem.tileSize.x, parseInt(input.value));
                    }
                }
                else
                    debugParticleSystem[name] = inputFloat;

                updateCode();
            }
            div.appendChild(document.createElement('br'));
            div.appendChild(input);
            div.appendChild(document.createTextNode(' ' + name));
        }

        div.appendChild(document.createElement('br'));
        div.appendChild(document.createElement('br'));
        div.appendChild(particleSystemCode = document.createElement('input'));
        particleSystemCode.disabled = true;
        div.appendChild(document.createTextNode(' code'));

        div.appendChild(document.createElement('br'));
        const button = document.createElement('button')
        div.appendChild(button);
        button.innerHTML = 'Copy To Clipboard';
        
        button.onclick = (e)=> navigator.clipboard.writeText(particleSystemCode.value); 

        const updateCode = ()=>
        {
            let code = '';
            let count = 0;
            for ( const setting of debugParticleSettings)
            {
                const name = setting[0];
                const type = setting[1];
                let value;
                if (name == 'tileSizeX' || type == 'alpha')
                    continue;

                if (count++)
                    code += ', ';

                if (name == 'tileSizeY')
                {
                    value = `vec2(${debugParticleSystem.tileSize.x},${debugParticleSystem.tileSize.y})`;
                }
                else if (type == 'color')
                {
                    const c = debugParticleSystem[name];
                    value = `new Color(${c.r},${c.g},${c.b},${c.a})`;
                }
                else
                    value = debugParticleSystem[name];
                code += value;
            }

            particleSystemCode.value = '...[' + code + ']';
        }
        updateCode();
    }
    debugParticleSystemDiv.style.display = debugParticleEditor ? '' : 'none'
}

const debugParticleSettings = 
[
    ['emitSize'],
    ['emitTime'],
    ['emitRate'],
    ['emitConeAngle'],
    ['tileIndex'],
    ['tileSizeX', 'tileSize'],
    ['tileSizeY', 'tileSize'],
    ['colorStartA', 'color'],
    ['colorStartB', 'color'],
    ['colorStartAlpha', 'alpha'],
    ['colorEndA',   'color'],
    ['colorEndB',   'color'],
    ['colorEndAlpha', 'alpha'],
    ['particleTime'],
    ['sizeStart'],
    ['sizeEnd'],
    ['speed'],
    ['angleSpeed'],
    ['damping'],
    ['angleDamping'],
    ['gravityScale'],
    ['particleConeAngle'],
    ['fadeRate'],
    ['randomness'],
    ['collideTiles'],
    ['additive'],
    ['randomColorComponents'],
    ['renderOrder'],
];

/*
    LittleJS Utility Classes and Functions
    - Vector2 - fast, simple, easy vector class
    - Color - holds a rgba color with math functions
    - Timer - tracks time automatically
    - Small math lib
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// helper functions

const PI            = Math.PI;
const isChrome      = window['chrome'];
const abs           = (a)=>               a < 0 ? -a : a;
const sign          = (a)=>               a < 0 ? -1 : 1;
const min           = (a, b)=>            a < b ?  a : b;
const max           = (a, b)=>            a > b ?  a : b;
const mod           = (a, b)=>            ((a % b) + b) % b;
const clamp         = (v, max=1, min=0)=> (ASSERT(max > min), v < min ? min : v > max ? max : v);
const percent       = (v, max=1, min=0)=> max-min ? clamp((v-min) / (max-min)) : 0;
const lerp          = (p, max=1, min=0)=> min + clamp(p) * (max-min);
const formatTime    = (t)=>               (t/60|0)+':'+(t%60<10?'0':'')+(t%60|0);
const isOverlapping = (pA, sA, pB, sB)=>  abs(pA.x - pB.x)*2 < sA.x + sB.x & abs(pA.y - pB.y)*2 < sA.y + sB.y;
const nearestPowerOfTwo = (v)=>           2**Math.ceil(Math.log2(v));

// random functions
const rand         = (a=1, b=0)=>              b + (a-b)*Math.random();
const randInt      = (a=1, b=0)=>              rand(a,b)|0;
const randSign     = ()=>                      (rand(2)|0)*2-1;
const randInCircle = (radius=1, minRadius=0)=> radius > 0 ? randVector(radius * rand(minRadius / radius, 1)**.5) : new Vector2;
const randVector   = (length=1)=>              new Vector2().setAngle(rand(2*PI), length);
const randColor    = (cA = new Color, cB = new Color(0,0,0,1), linear)=>
    linear ?  cA.lerp(cB, rand()) : new Color(rand(cA.r,cB.r),rand(cA.g,cB.g),rand(cA.b,cB.b),rand(cA.a,cB.a));

// seeded random numbers using xorshift
let randSeed     = 1;
const randSeeded = (a=1, b=0)=>
{
    randSeed ^= randSeed << 13; randSeed ^= randSeed >>> 17; randSeed ^= randSeed << 5;
    return b + (a-b)*abs(randSeed % 1e9)/1e9;
}

// create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
const vec2 = (x=0, y)=> x.x == undefined? new Vector2(x, y == undefined? x : y) : new Vector2(x.x, x.y);

///////////////////////////////////////////////////////////////////////////////
class Vector2
{
    constructor(x=0, y=0) { this.x = x; this.y = y; }

    // basic math operators, a vector or scaler can be passed in
    copy()                { return new Vector2(this.x, this.y); }
    scale(s)              { ASSERT(s.x==undefined); return new Vector2(this.x * s, this.y * s); }
    add(v)                { ASSERT(v.x!=undefined); return new Vector2(this.x + v.x, this.y + v.y); }
    subtract(v)           { ASSERT(v.x!=undefined); return new Vector2(this.x - v.x, this.y - v.y); }
    multiply(v)           { ASSERT(v.x!=undefined); return new Vector2(this.x * v.x, this.y * v.y); }
    divide(v)             { ASSERT(v.x!=undefined); return new Vector2(this.x / v.x, this.y / v.y); }

    // vector math operators
    length()              { return this.lengthSquared()**.5; }
    lengthSquared()       { return this.x**2 + this.y**2; }
    distance(p)           { return this.distanceSquared(p)**.5; }
    distanceSquared(p)    { return (this.x - p.x)**2 + (this.y - p.y)**2; }
    normalize(length=1)   { const l = this.length(); return l ? this.scale(length/l) : new Vector2(length); }
    clampLength(length=1) { const l = this.length(); return l > length ? this.scale(length/l) : this; }
    dot(v)                { ASSERT(v.x!=undefined); return this.x*v.x + this.y*v.y; }
    cross(v)              { ASSERT(v.x!=undefined); return this.x*v.y - this.y*v.x; }
    angle()               { return Math.atan2(this.x, this.y); }
    setAngle(a, length=1) { this.x = length*Math.sin(a); this.y = length*Math.cos(a); return this; }
    rotate(a)             { const c = Math.cos(a), s = Math.sin(a); return new Vector2(this.x*c-this.y*s, this.x*s+this.y*c); }
    direction()           { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }
    flip()                { return new Vector2(this.y, this.x); }
    invert()              { return new Vector2(this.y, -this.x); }
    round()               { return new Vector2(Math.round(this.x), Math.round(this.y)); }
    floor()               { return new Vector2(Math.floor(this.x), Math.floor(this.y)); }
    int()                 { return new Vector2(this.x|0, this.y|0); }
    lerp(v, p)            { ASSERT(v.x!=undefined); return this.add(v.subtract(this).scale(clamp(p))); }
    area()                { return this.x * this.y; }
    arrayCheck(arraySize) { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; } 
}

///////////////////////////////////////////////////////////////////////////////
class Color
{
    constructor(r=1, g=1, b=1, a=1) { this.r=r; this.g=g; this.b=b; this.a=a; }

    copy(c)     { return new Color(this.r, this.g, this.b, this.a); }
    add(c)      { return new Color(this.r+c.r, this.g+c.g, this.b+c.b, this.a+c.a); }
    subtract(c) { return new Color(this.r-c.r, this.g-c.g, this.b-c.b, this.a-c.a); }
    multiply(c) { return new Color(this.r*c.r, this.g*c.g, this.b*c.b, this.a*c.a); }
    scale(s,a=s){ return new Color(this.r*s, this.g*s, this.b*s, this.a*a); }
    clamp()     { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); }
    lerp(c, p)  { return this.add(c.subtract(this).scale(clamp(p))); }
    mutate(amount=.05, alphaAmount=0) 
    {
        return new Color
        (
            this.r + rand(amount, -amount),
            this.g + rand(amount, -amount),
            this.b + rand(amount, -amount),
            this.a + rand(alphaAmount, -alphaAmount)
        ).clamp();
    }
    rgba()      
    { 
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return `rgb(${this.r*255|0},${this.g*255|0},${this.b*255|0},${this.a})`; 
    }
    rgbaInt()  
    {
        ASSERT(this.r>=0 && this.r<=1 && this.g>=0 && this.g<=1 && this.b>=0 && this.b<=1 && this.a>=0 && this.a<=1);
        return (this.r*255|0) + (this.g*255<<8) + (this.b*255<<16) + (this.a*255<<24); 
    }
    setHSLA(h=0, s=0, l=1, a=1)
    {
        const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q,
            f = (p, q, t)=>
                (t = ((t%1)+1)%1) < 1/6 ? p+(q-p)*6*t :
                t < 1/2 ? q :
                t < 2/3 ? p+(q-p)*(2/3-t)*6 : p;
                
        this.r = f(p, q, h + 1/3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1/3);
        this.a = a;
        return this;
    }
}

///////////////////////////////////////////////////////////////////////////////
class Timer
{
    constructor(timeLeft)   { this.time = timeLeft == undefined ? undefined : time + timeLeft; this.setTime = timeLeft; }

    set(timeLeft=0) { this.time = time + timeLeft; this.setTime = timeLeft; }
    unset()         { this.time = undefined; }
    isSet()         { return this.time != undefined; }
    active()        { return time <= this.time; }
    elapsed()       { return time >  this.time; }
    get()           { return this.isSet()? time - this.time : 0; }
    getPercent()    { return this.isSet()? percent(this.time - time, 0, this.setTime) : 0; }
}
/*
    LittleJS Engine Configuration
*/

///////////////////////////////////////////////////////////////////////////////
// display settings

const maxWidth = 1920, maxHeight = 1200; // up to 1080p and 16:10
let defaultFont = 'arial';               // font used for text rendering
let fixedWidth = 0, fixedHeight = 0;     // use native resolution
//const fixedWidth = 1280, fixedHeight = 720;  // 720p
//const fixedWidth = 1920, fixedHeight = 1080; // 1080p
//const fixedWidth = 128,  fixedHeight = 128;  // PICO-8
//const fixedWidth = 240,  fixedHeight = 136;  // TIC-80

///////////////////////////////////////////////////////////////////////////////
// tile sheet settings

const defaultTileSize = vec2(16); // default size of tiles in pixels
const tileBleedShrinkFix = .3;    // prevent tile bleeding from neighbors
let pixelated = 1;                // use crisp pixels for pixel art

///////////////////////////////////////////////////////////////////////////////
// webgl config

const glEnable = 1; // can run without gl (texured coloring will be disabled)
let glOverlay = 0;  // fix slow rendering in some browsers by not compositing the WebGL canvas

///////////////////////////////////////////////////////////////////////////////
// object config

const defaultObjectSize = vec2(.999);  // size of objecs, tiny bit less then 1 to fit in holes
const defaultObjectMass = 1;           // how heavy are objects for collison calcuations
const defaultObjectDamping = .99;      // how much to slow velocity by each frame 0-1
const defaultObjectAngleDamping = .99; // how much to slow angular velocity each frame 0-1
const defaultObjectElasticity = 0;     // how much to bounce 0-1
const defaultObjectFriction = .8;      // how much to slow when touching 0-1
const maxObjectSpeed = 1;              // camp max speed to avoid fast objects missing collisions

///////////////////////////////////////////////////////////////////////////////
// input config

const gamepadsEnable = 1;              // should gamepads be allowed
const touchInputEnable = 1;            // touch input is routed to mouse
const copyGamepadDirectionToStick = 1; // allow players to use dpad as analog stick
const copyWASDToDpad = 1;              // allow players to use WASD as direction keys

///////////////////////////////////////////////////////////////////////////////
// audio config

const soundEnable = 1;      // all audio can be disabled
let audioVolume = .3;       // volume for sound, music and speech
let defaultSoundRange = 20; // distance where taper starts
let soundTaperPecent = .5;  // extra range added for sound taper

///////////////////////////////////////////////////////////////////////////////
// medals config

const medalDisplayTime = 5;       // how long to show medals
const medalDisplaySlideTime = .5; // how quick to slide on/off medals
const medalDisplayWidth = 640;    // width of medal display
const medalDisplayHeight = 99;    // height of medal display
const medalDisplayIconSize = 80;  // size of icon in medal display
/*
    LittleJS - The Tiny JavaScript Game Engine That Can
    MIT License - Copyright 2019 Frank Force

    Engine Features
    - Engine and debug system are separate from game code
    - Object oriented with base class engine object
    - Engine handles core update loop
    - Base class object handles update, physics, collision, rendering, etc
    - Engine helper classes and functions like Vector2, Color, and Timer
    - Super fast rendering system for tile sheets
    - Sound effects audio with zzfx and music with zzfxm
    - Input processing system with gamepad and touchscreen support
    - Tile layer rendering and collision system
    - Particle effect system
    - Automatically calls gameInit(), gameUpdate(), gameUpdatePost(), gameRender(), gameRenderPost()
    - Debug tools and debug rendering system
    - Call engineInit() to start it up!
*/

'use strict';

const engineName = 'LittleJS';
const engineVersion = '1.0.5';
const FPS = 60, timeDelta = 1/FPS; // engine uses a fixed time step
const tileImage = new Image(); // everything uses the same tile sheet

// core engine variables
let mainCanvas, mainContext, mainCanvasSize=vec2(), 
engineObjects=[], engineCollideObjects=[],
cameraPos=vec2(), cameraScale=max(defaultTileSize.x, defaultTileSize.y),
frame=0, time=0, realTime=0, paused=0, frameTimeLastMS=0, frameTimeBufferMS=0, debugFPS=0, gravity=0, 
tileImageSize, tileImageSizeInverse, shrinkTilesX, shrinkTilesY, drawCount;

// call this function to start the engine
function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, tileImageSource)
{
    // init engine when tiles load
    tileImage.onload = ()=>
    {
        // save tile image info
        tileImageSizeInverse = vec2(1).divide(tileImageSize = vec2(tileImage.width, tileImage.height));
        debug && (tileImage.onload=()=>ASSERT(1)); // tile sheet can not reloaded
        shrinkTilesX = tileBleedShrinkFix/tileImageSize.x;
        shrinkTilesY = tileBleedShrinkFix/tileImageSize.y;

        // setup html
        document.body.appendChild(mainCanvas = document.createElement('canvas'));
        document.body.style = 'margin:0;overflow:hidden;background:#000';
        mainCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' +
            (pixelated ? ';image-rendering:crisp-edges;image-rendering:pixelated' : ''); // pixelated rendering
        mainContext = mainCanvas.getContext('2d');

        // init stuff and start engine
        debugInit();
        glInit();
        gameInit();
        engineUpdate();
    };

    // main update loop
    const engineUpdate = (frameTimeMS=0)=>
    {
        requestAnimationFrame(engineUpdate);
        
        if (!document.hasFocus())
            inputData[0].length = 0; // clear input when lost focus

        // prepare to update time
        const realFrameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        let frameTimeDeltaMS = realFrameTimeDeltaMS;
        frameTimeLastMS = frameTimeMS;
        realTime = frameTimeMS / 1e3;
        if (debug)
            frameTimeDeltaMS *= keyIsDown(107) ? 5 : keyIsDown(109) ? .2 : 1;
        if (!paused)
            frameTimeBufferMS += frameTimeDeltaMS;

        // update frame
        mousePos = screenToWorld(mousePosScreen);
        updateGamepads();

        // apply time delta smoothing, improves smoothness of framerate in some browsers
        let deltaSmooth = 0;
        if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9)
        {
            // force an update each frame if time is close enough (not just a fast refresh rate)
            deltaSmooth = frameTimeBufferMS;
            frameTimeBufferMS = 0;
            //debug && frameTimeBufferMS < 0 && console.log('time smoothing: ' + -deltaSmooth);
        }
        //debug && frameTimeBufferMS < 0 && console.log('skipped frame! ' + -frameTimeBufferMS);

        // clamp incase of extra long frames (slow framerate)
        frameTimeBufferMS = min(frameTimeBufferMS, 50);
        
        // update the frame
        for (;frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / FPS)
        {
            // main frame update
            gameUpdate();
            engineUpdateObjects();
            gameUpdatePost();
            debugUpdate();

            // update input
            for (let deviceInputData of inputData)
                deviceInputData.map(k=> k.r = k.p = 0);
            mouseWheel = 0;
        }

        // add the smoothing back in
        frameTimeBufferMS += deltaSmooth;

        if (fixedWidth)
        {
            // clear and fill window if smaller
            mainCanvas.width = fixedWidth;
            mainCanvas.height = fixedHeight;
            
            // fit to window width if smaller
            const fixedAspect = fixedWidth / fixedHeight;
            const aspect = innerWidth / innerHeight;
            mainCanvas.style.width = aspect < fixedAspect ? '100%' : '';
            mainCanvas.style.height = aspect < fixedAspect ? '' : '100%';
            if (glCanvas)
            {
                glCanvas.style.width = mainCanvas.style.width;
                glCanvas.style.height = mainCanvas.style.height;
            }
        }
        else
        {
            // fill the window
            mainCanvas.width = min(innerWidth, maxWidth);
            mainCanvas.height = min(innerHeight, maxHeight);
        }

        // save canvas size
        mainCanvasSize = vec2(mainCanvas.width, mainCanvas.height);
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art

        // render sort then render while removing destroyed objects
        glPreRender(mainCanvas.width, mainCanvas.height);
        gameRender();
        engineObjects.sort((a,b)=> a.renderOrder - b.renderOrder);
        for (const o of engineObjects)
            o.destroyed || o.render();
        glCopyToContext(mainContext);
        gameRenderPost();
        medalsRender();
        debugRender();

        if (showWatermark)
        {
            // update fps
            debugFPS = lerp(.05, 1e3/(realFrameTimeDeltaMS||1), debugFPS);
            mainContext.textAlign = 'right';
            mainContext.textBaseline = 'top';
            mainContext.font = '1em monospace';
            mainContext.fillStyle = '#000';
            const text = engineName + ' ' + 'v' + engineVersion + ' / ' 
                + drawCount + ' / ' + engineObjects.length + ' / ' + debugFPS.toFixed(1);
            mainContext.fillText(text, mainCanvas.width-3, 3);
            mainContext.fillStyle = '#fff';
            mainContext.fillText(text, mainCanvas.width-2, 2);
            drawCount = 0;
        }

        // copy anything left in the buffer if necessary
        glCopyToContext(mainContext);
    }

    // set tile image source to load the image and start the engine
    tileImageSource ? tileImage.src = tileImageSource : tileImage.onload();
}

function engineUpdateObjects()
{
    // recursive object update
    const updateObject = (o)=>
    {
        if (!o.destroyed)
        {
            o.update();
            for (const child of o.children)
                updateObject(child);
        }
    }
    for (const o of engineObjects)
        o.parent || updateObject(o);

    // remove destroyed objects
    engineObjects = engineObjects.filter(o=>!o.destroyed);
    engineCollideObjects = engineCollideObjects.filter(o=>!o.destroyed);

    // increment frame and update time
    time = ++frame / FPS;
}
/*
    LittleJS Object Base Class
    - Base object class used by the engine
    - Automatically adds self to object list
    - Will be updated and rendered each frame
    - Renders as a sprite from a tilesheet by default
    - Can have color and addtive color applied
    - 2d Physics and collision system
    - Sorted by renderOrder
    - Objects can have children attached
    - Parents are updated before children, and set child transform
    - Call destroy() to get rid of objects
*/

'use strict';

class EngineObject
{
    constructor(pos, size=defaultObjectSize, tileIndex=-1, tileSize=defaultTileSize, angle=0, color)
    {
        // set passed in params
        ASSERT(pos && pos.x != undefined && size.x != undefined); // ensure pos and size are vec2s
        this.pos = pos.copy();
        this.size = size;
        this.tileIndex = tileIndex;
        this.tileSize = tileSize;
        this.angle = angle;
        this.color = color;

        // set physics defaults
        this.mass         = defaultObjectMass;
        this.damping      = defaultObjectDamping;
        this.angleDamping = defaultObjectAngleDamping;
        this.elasticity   = defaultObjectElasticity;
        this.friction     = defaultObjectFriction;

        // init other object stuff
        this.spawnTime = time;
        this.velocity = vec2(this.collideSolidObjects = this.renderOrder = this.angleVelocity = 0);
        this.collideTiles = this.gravityScale = 1;
        this.children = [];

        // add to list of objects
        engineObjects.push(this);
    }
    
    update()
    {
        if (this.parent)
        {
            // copy parent pos/angle
            this.pos = this.localPos.multiply(vec2(this.getMirrorSign(),1)).rotate(-this.parent.angle).add(this.parent.pos);
            this.angle = this.getMirrorSign()*this.localAngle + this.parent.angle;
            return;
        }

        // limit max speed to prevent missing collisions
        this.velocity.x = clamp(this.velocity.x, maxObjectSpeed, -maxObjectSpeed);
        this.velocity.y = clamp(this.velocity.y, maxObjectSpeed, -maxObjectSpeed);

        // apply physics
        const oldPos = this.pos.copy();
        this.pos.x += this.velocity.x = this.damping * this.velocity.x;
        this.pos.y += this.velocity.y = this.damping * this.velocity.y + gravity * this.gravityScale;
        this.angle += this.angleVelocity *= this.angleDamping;

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);

        if (!this.mass) // do not update collision for fixed objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = 1e-3; // necessary to push slightly outside of the collision
            for (const o of engineCollideObjects)
            {
                // non solid objects don't collide with eachother
                if (!this.isSolid & !o.isSolid || o.destroyed || o.parent)
                    continue;

                // check collision
                if (!isOverlapping(this.pos, this.size, o.pos, o.size) || o == this)
                    continue;

                // pass collision to objects
                if (!this.collideWithObject(o) | !o.collideWithObject(this))
                    continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001; // push away if alread overlapping
                    const velocity = length < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                        
                    debugPhysics && debugAABB(this.pos, o.pos, this.size, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sx = this.size.x + o.size.x;
                const sy = this.size.y + o.size.y;
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sy + gravity; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sy;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sx;
                
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sy*.5 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -this.elasticity;
                    }
                    else if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.y + o.mass * o.velocity.y) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.y * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.y * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.y * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.y * 2 * this.mass / (this.mass + o.mass);

                        // lerp betwen elastic or inelastic based on elasticity
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.y = lerp(elasticity, elastic0, inelastic);
                        o.velocity.y = lerp(elasticity, elastic1, inelastic);
                    }
                    debugPhysics && smallStepUp && (abs(oldPos.x - o.pos.x)*2 > sx) && console.log('stepUp', oldPos.y - o.pos.y);
                }
                if (!smallStepUp && isBlockedX) // resolve x collision
                {
                    // push outside collision
                    this.pos.x = o.pos.x + (sx*.5 + epsilon) * sign(oldPos.x - o.pos.x);
                    if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.x + o.mass * o.velocity.x) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.x * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.x * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.x * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.x * 2 * this.mass / (this.mass + o.mass);

                        // lerp betwen elastic or inelastic based on elasticity
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.x = lerp(elasticity, elastic0, inelastic);
                        o.velocity.x = lerp(elasticity, elastic1, inelastic);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -this.elasticity;
                }

                debugPhysics && debugAABB(this.pos, o.pos, this.size, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this))
            {
                //debugPhysics && debugRect(this.pos, this.size, '#ff0');

                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedY = tileCollisionTest(new Vector2(oldPos.x, this.pos.y), this.size, this);
                    const isBlockedX = tileCollisionTest(new Vector2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX)
                    {
                        // set if landed on ground
                        this.groundObject = wasMovingDown;

                        // push out of collision and bounce
                        this.pos.y = oldPos.y;
                        this.velocity.y *= -this.elasticity;
                    }
                    if (isBlockedX)
                    {
                        // push out of collision and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                }
            }
        }
    }
       
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    }
    
    destroy()             
    { 
        if (this.destroyed)
            return;
        
        // disconnect from parent and destroy chidren
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
            child.destroy(child.parent = 0);
    }
    collideWithTile(data, pos)        { return data > 0; }
    collideWithTileRaycast(data, pos) { return data > 0; }
    collideWithObject(o)              { return 1; }
    getAliveTime()                    { return time - this.spawnTime; }
    applyAcceleration(a)              { ASSERT(!this.isFixed()); this.velocity = this.velocity.add(a); }
    applyForce(force)	              { this.applyAcceleration(force.scale(1/this.mass)); }
    isFixed()                         { return !this.mass; }
    getMirrorSign(s=1)                { return this.mirror ? -s : s; }

    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }
    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    setCollision(collideSolidObjects, isSolid, collideTiles=1)
    {
        ASSERT(collideSolidObjects || !isSolid); // solid objects must be set to collide

        // track collidable objects in separate list
        if (collideSolidObjects && !this.collideSolidObjects)
        {
            ASSERT(!engineCollideObjects.includes(this));
            engineCollideObjects.push(this);
        }
        else if (!collideSolidObjects && this.collideSolidObjects)
        {
            ASSERT(engineCollideObjects.includes(this))
            engineCollideObjects.splice(engineCollideObjects.indexOf(this), 1);
        }

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
    }
}

function destroyAllObjects()
{
    // remove all objects that are not persistent or are descendants of something persistent
    for (const o of engineObjects)
        o.persistent || o.parent || o.destroy();
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

function forEachObject(pos, size=0, callbackFunction=(o)=>1, collideObjectsOnly=1)
{
    const objectList = collideObjectsOnly ? engineCollideObjects : engineObjects;
    if (!size)
    {
        // no overlap test
        for (const o of objectList)
            callbackFunction(o);
    }
    else if (size.x != undefined)
    {
        // aabb test
        for (const o of objectList)
            isOverlapping(pos, size, o.pos, o.size) && callbackFunction(o);
    }
    else
    {
        // circle test
        const sizeSquared = size**2;
        for (const o of objectList)
            pos.distanceSquared(o.pos) < sizeSquared && callbackFunction(o);
    }
}
/*
    LittleJS Drawing System

    - Super fast tile sheet rendering
    - Utility functions for webgl
*/

'use strict';

// convert between screen and world coordinates
const screenToWorld = (screenPos)=>
    screenPos.add(vec2(.5)).subtract(mainCanvasSize.scale(.5)).multiply(vec2(1/cameraScale,-1/cameraScale)).add(cameraPos);
const worldToScreen = (worldPos)=>
    worldPos.subtract(cameraPos).multiply(vec2(cameraScale,-cameraScale)).add(mainCanvasSize.scale(.5)).subtract(vec2(.5));

// draw textured tile centered on pos
function drawTile(pos, size=vec2(1), tileIndex=-1, tileSize=defaultTileSize, color=new Color, angle=0, mirror, 
    additiveColor=new Color(0,0,0,0))
{
    showWatermark && ++drawCount;
    if (glEnable)
    {
        if (tileIndex < 0)
        {
            // if negative tile index, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt()); 
        }
        else
        {
            // calculate uvs and render
            const cols = tileImage.width / tileSize.x |0;
            const uvSizeX = tileSize.x * tileImageSizeInverse.x;
            const uvSizeY = tileSize.y * tileImageSizeInverse.y;
            const uvX = (tileIndex%cols)*uvSizeX, uvY = (tileIndex/cols|0)*uvSizeY;

            // shrink uvs to prevent bleeding
            const shrinkTilesX = tileBleedShrinkFix * tileImageSizeInverse.x;
            const shrinkTilesY = tileBleedShrinkFix * tileImageSizeInverse.y;
            
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                uvX + shrinkTilesX, uvY + shrinkTilesY, 
                uvX - shrinkTilesX + uvSizeX, uvY - shrinkTilesX + uvSizeY, 
                color.rgbaInt(), additiveColor.rgbaInt()); 
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // if negative tile index, force untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                // calculate uvs and render
                const cols = tileImage.width / tileSize.x |0;
                const sX = (tileIndex%cols)*tileSize.x   + tileBleedShrinkFix;
                const sY = (tileIndex/cols|0)*tileSize.y + tileBleedShrinkFix;
                const sWidth  = tileSize.x - 2*tileBleedShrinkFix;
                const sHeight = tileSize.y - 2*tileBleedShrinkFix;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(tileImage, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            }
        });
    }
}

// draw a colored untextured rect centered on pos
function drawRect(pos, size, color, angle)
{
    drawTile(pos, size, -1, defaultTileSize, color, angle);
}

// draw textured tile centered on pos in screen space
function drawTileScreenSpace(pos, size=vec2(1), tileIndex, tileSize, color, angle, mirror, additiveColor)
{
    drawTile(screenToWorld(pos), size.scale(1/cameraScale), tileIndex, tileSize, color, angle, mirror, additiveColor);
}

// draw a colored untextured rect in screen space
function drawRectScreenSpace(pos, size, color, angle)
{
    drawTileScreenSpace(pos, size, -1, defaultTileSize, color, angle);
}

// draw a colored line between two points
function drawLine(posA, posB, thickness=.1, color)
{
    const halfDelta = vec2((posB.x - posA.x)*.5, (posB.y - posA.y)*.5);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle());
}

// draw directly to the 2d canvas in world space (bipass webgl)
function drawCanvas2D(pos, size, angle, mirror, drawFunction)
{
    // create canvas transform from world space to screen space
    pos = worldToScreen(pos);
    size = size.scale(cameraScale);
    mainContext.save();
    mainContext.translate(pos.x+.5|0, pos.y-.5|0);
    mainContext.rotate(angle);
    mainContext.scale(mirror?-size.x:size.x, size.y);
    drawFunction(mainContext);
    mainContext.restore();
}

// draw text in world space without canvas scaling because that messes up fonts
function drawText(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=defaultFont)
{
    pos = worldToScreen(pos);
    mainContext.font = size*cameraScale + 'px '+ font;
    mainContext.textAlign = textAlign;
    mainContext.textBaseline = 'middle';
    if (lineWidth)
    {
        mainContext.lineWidth = lineWidth*cameraScale;
        mainContext.strokeStyle = lineColor.rgba();
        mainContext.strokeText(text, pos.x, pos.y);
    }
    mainContext.fillStyle = color.rgba();
    mainContext.fillText(text, pos.x, pos.y);
}

// enable additive or regular blend mode
function setBlendMode(additive)
{
    glEnable ? glSetBlendMode(additive) : mainContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}
/*
    LittleJS Input System
    - Tracks key down, pressed, and released
    - Also tracks mouse buttons, position, and wheel
    - Supports multiple gamepads
*/

'use strict';

// input for all devices including keyboard, mouse, and gamepad. (d=down, p=pressed, r=released)
const inputData = [[]];
const keyIsDown      = (key, device=0)=> inputData[device] && inputData[device][key] && inputData[device][key].d ? 1 : 0;
const keyWasPressed  = (key, device=0)=> inputData[device] && inputData[device][key] && inputData[device][key].p ? 1 : 0;
const keyWasReleased = (key, device=0)=> inputData[device] && inputData[device][key] && inputData[device][key].r ? 1 : 0;
const clearInput     = ()=> inputData[0].length = 0;

// mouse input is stored with keyboard
let hadInput   = 0;
let mouseWheel = 0;
let mousePosScreen = vec2();
let mousePos = vec2();
const mouseIsDown      = keyIsDown;
const mouseWasPressed  = keyWasPressed;
const mouseWasReleased = keyWasReleased;

// handle input events
onkeydown   = e=>
{
    if (debug && e.target != document.body) return;
    e.repeat || (inputData[isUsingGamepad = 0][remapKeyCode(e.keyCode)] = {d:hadInput=1, p:1});
}
onkeyup     = e=>
{
    if (debug && e.target != document.body) return;
    const c = remapKeyCode(e.keyCode); inputData[0][c] && (inputData[0][c].d = 0, inputData[0][c].r = 1);
}
onmousedown = e=> (inputData[isUsingGamepad = 0][e.button] = {d:hadInput=1, p:1}, onmousemove(e));
onmouseup   = e=> inputData[0][e.button] && (inputData[0][e.button].d = 0, inputData[0][e.button].r = 1);
onmousemove = e=>
{
    if (!mainCanvas)
        return;

    // convert mouse pos to canvas space
    const rect = mainCanvas.getBoundingClientRect();
    mousePosScreen.x = mainCanvasSize.x * percent(e.x, rect.right, rect.left);
    mousePosScreen.y = mainCanvasSize.y * percent(e.y, rect.bottom, rect.top);
}
onwheel = e=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
oncontextmenu = e=> !1; // prevent right click menu
const remapKeyCode = c=> copyWASDToDpad ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

////////////////////////////////////////////////////////////////////
// gamepad

let isUsingGamepad = 0;
const gamepadStick       = (stick,  gamepad=0)=> inputData[gamepad+1] ? inputData[gamepad+1].stickData[stick] || vec2() : vec2();
const gamepadIsDown      = (button, gamepad=0)=> keyIsDown     (button, gamepad+1);
const gamepadWasPressed  = (button, gamepad=0)=> keyWasPressed (button, gamepad+1);
const gamepadWasReleased = (button, gamepad=0)=> keyWasReleased(button, gamepad+1);

function updateGamepads()
{
    if (!gamepadsEnable) return;

    if (!navigator.getGamepads || !document.hasFocus() && !debug)
        return;

    // poll gamepads
    const gamepads = navigator.getGamepads();
    for (let i = gamepads.length; i--;)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        let data = inputData[i+1];
        if (!data)
        {
            data = inputData[i+1] = [];
            data.stickData = [];
        }

        if (gamepad)
        {
            // read clamp dead zone of analog sticks
            const deadZone = .3, deadZoneMax = .8;
            const applyDeadZone = (v)=> 
                v >  deadZone ?  percent( v, deadZoneMax, deadZone) : 
                v < -deadZone ? -percent(-v, deadZoneMax, deadZone) : 0;

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                data.stickData[j>>1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j+1])).clampLength();
            
            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];
                inputData[i+1][j] = button.pressed ? {d:1, p:!gamepadIsDown(j,i)} : 
                inputData[i+1][j] = {r:gamepadIsDown(j,i)}
                isUsingGamepad |= button.pressed && !i;
            }
            
            if (copyGamepadDirectionToStick)
            {
                // copy dpad to left analog stick when pressed
                if (gamepadIsDown(12,i)|gamepadIsDown(13,i)|gamepadIsDown(14,i)|gamepadIsDown(15,i))
                    data.stickData[0] = vec2(
                        gamepadIsDown(15,i) - gamepadIsDown(14,i), 
                        gamepadIsDown(12,i) - gamepadIsDown(13,i)
                    ).clampLength();
            }

            if (debugGamepads)
            {
                // gamepad debug display
                const stickScale = 2;
                const buttonScale = .5;
                const centerPos = cameraPos;
                for (let j = data.stickData.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*stickScale*2,i*stickScale*3));
                    const stickPos = drawPos.add(data.stickData[j].scale(stickScale));
                    debugCircle(drawPos, stickScale, '#fff7',0,1);
                    debugLine(drawPos, stickPos, '#f00');
                    debugPoint(stickPos, '#f00');
                }
                for (let j = gamepad.buttons.length; j--;)
                {
                    const drawPos = centerPos.add(vec2(j*buttonScale*2, i*stickScale*3-stickScale-buttonScale));
                    const pressed = gamepad.buttons[j].pressed;
                    debugCircle(drawPos, buttonScale, pressed ? '#f00' : '#fff7', 0, 1);
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// touch screen input

const isTouchDevice = touchInputEnable && window.ontouchstart !== undefined;
if (isTouchDevice)
{
    // handle all touch events the same way
    ontouchstart = ontouchmove = ontouchend = e=>
    {
        e.button = 0; // all touches are left click
        hadInput || zzfx(0, hadInput = 1) ; // fix mobile audio, force it to play a sound the first time

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        if (touching)
        {
            // set event pos and pass it along
            e.x = e.touches[0].clientX;
            e.y = e.touches[0].clientY;
            wasTouching ? onmousemove(e) : onmousedown(e);
        }
        else if (wasTouching)
            wasTouching && onmouseup(e);

        // set was touching
        wasTouching = touching;

        // prevent normal mouse events from being called
        return !e.cancelable;
    }
    let wasTouching;
}
/*
    LittleJS Audio System
    - ZzFX Sound Effects
    - ZzFXM Music
    - Speech Synthesis
    - Can attenuate zzfx sounds by camera range
*/

'use strict';

let audioContext; // audio context used by the engine

// play a zzfx sound in world space with attenuation and culling
function playSound(zzfxSound, pos, range=defaultSoundRange, volumeScale=1, pitchScale=1)
{
    if (!soundEnable) return;

    let pan = 0;
    if (pos)
    {
        if (range)
        {
            // apply range based fade
            const lengthSquared = cameraPos.distanceSquared(pos);
            const maxRange = range * (soundTaperPecent + 1);
            if (lengthSquared > maxRange**2)
                return; // out of range

            // attenuate volume by distance
            volumeScale *= percent(lengthSquared**.5, range, maxRange);
        }

        // get pan from screen space coords
        pan = 2*worldToScreen(pos).x/mainCanvas.width-1;
    }

    // copy sound (so changes aren't permanant)
    zzfxSound = [...zzfxSound];

    // scale volume and pitch
    zzfxSound[0] = (zzfxSound[0]||1) * volumeScale;
    zzfxSound[2] = (zzfxSound[2]||220) * pitchScale;

    // play the sound
    return zzfxP(pan, zzfxG(...zzfxSound));
}

// render and play zzfxm music with an option to loop
function playMusic(zzfxmMusic, loop=0, pan=0) 
{
    if (!soundEnable) return;

    return playSamples(zzfxM(...zzfxmMusic), loop, pan);
}

// play cached samples to avoid pause when playing music/sounds
function playSamples(samples, loop=0, pan=0) 
{
    if (!soundEnable) return;

    const source = zzfxP(pan,...samples);
    if (source)
        source.loop = loop;
    return source;
}

// play mp3 or wav audio from a local file or url
function playAudioFile(url, loop=0, volumeScale=1)
{
    if (!soundEnable) return;

    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = volumeScale * audioVolume;
    audio.play();
    return audio;
}

// speak text with passed in settings
function speak(text, language='', volume=1, rate=1, pitch=1)
{
    if (!soundEnable || !speechSynthesis) return;

    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean

    // build utterance and speak
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = volume*audioVolume*3;
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
}

// stop all queued speech
const stopSpeech = ()=> speechSynthesis && speechSynthesis.cancel();

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.1.8 by Frank Force

const zzfxR = 44100; // sample rate
const zzfx = (...z) => zzfxP(0, zzfxG(...z)); // generate and play sound
function zzfxP(pan,...samples)  // play samples
{
    if (!soundEnable) return;
    
    // create audio context
    if (!audioContext)
        audioContext = new (window.AudioContext||webkitAudioContext);

    // create buffer and source
    const buffer = audioContext.createBuffer(samples.length, samples[0].length, zzfxR), 
        source = audioContext.createBufferSource();

    // copy samples to buffer
    samples.map((d,i)=> buffer.getChannelData(i).set(d));
    source.buffer = buffer;

    // create pan node
    pan = clamp(pan, 1, -1);
    const panNode = new StereoPannerNode(audioContext, {'pan':pan});
    source.connect(panNode).connect(audioContext.destination);

    // play and return sound
    source.start();
    return source;
}

function zzfxG // generate samples
(
    // parameters
    volume = 1, randomness = .05, frequency = 220, attack = 0, sustain = 0,
    release = .1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0,
    pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0,
    bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0
)
{
    // init parameters
    let PI2 = PI*2, sign = v => v>0?1:-1,
        startSlide = slide *= 500 * PI2 / zzfxR / zzfxR, b=[],
        startFrequency = frequency *= (1 + randomness*2*Math.random() - randomness) * PI2 / zzfxR,
        t=0, tm=0, i=0, j=1, r=0, c=0, s=0, f, length;
        
    // scale by sample rate
    attack = attack * zzfxR + 9; // minimum attack to prevent pop
    decay *= zzfxR;
    sustain *= zzfxR;
    release *= zzfxR;
    delay *= zzfxR;
    deltaSlide *= 500 * PI2 / zzfxR**3;
    modulation *= PI2 / zzfxR;
    pitchJump *= PI2 / zzfxR;
    pitchJumpTime *= zzfxR;
    repeatTime = repeatTime * zzfxR | 0;

    // generate waveform
    for (length = attack + decay + sustain + release + delay | 0;
        i < length; b[i++] = s)
    {
        if (!(++c%(bitCrush*100|0)))                      // bit crush
        {
            s = shape? shape>1? shape>2? shape>3?         // wave shape
                Math.sin((t%PI2)**3) :                    // 4 noise
                Math.max(Math.min(Math.tan(t),1),-1):     // 3 tan
                1-(2*t/PI2%2+2)%2:                        // 2 saw
                1-4*abs(Math.round(t/PI2)-t/PI2):    // 1 triangle
                Math.sin(t);                              // 0 sin
                
            s = (repeatTime ?
                    1 - tremolo + tremolo*Math.sin(PI2*i/repeatTime) // tremolo
                    : 1) *
                sign(s)*(abs(s)**shapeCurve) *       // curve 0=square, 2=pointy
                volume * audioVolume * (                  // envelope
                i < attack ? i/attack :                   // attack
                i < attack + decay ?                      // decay
                1-((i-attack)/decay)*(1-sustainVolume) :  // decay falloff
                i < attack  + decay + sustain ?           // sustain
                sustainVolume :                           // sustain volume
                i < length - delay ?                      // release
                (length - i - delay)/release *            // release falloff
                sustainVolume :                           // release volume
                0);                                       // post release
 
            s = delay ? s/2 + (delay > i ? 0 :            // delay
                (i<length-delay? 1 : (length-i)/delay) *  // release delay 
                b[i-delay|0]/2) : s;                      // sample delay
        }

        f = (frequency += slide += deltaSlide) *          // frequency
            Math.cos(modulation*tm++);                    // modulation
        t += f - f*noise*(1 - (Math.sin(i)+1)*1e9%2);     // noise

        if (j && ++j > pitchJumpTime)       // pitch jump
        {
            frequency += pitchJump;         // apply pitch jump
            startFrequency += pitchJump;    // also apply to start
            j = 0;                          // reset pitch jump time
        }

        if (repeatTime && !(++r % repeatTime)) // repeat
        {
            frequency = startFrequency;     // reset frequency
            slide = startSlide;             // reset slide
            j = j || 1;                     // reset pitch jump time
        }
    }
    
    return b;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force

function zzfxM(instruments, patterns, sequence, BPM = 125) 
{
  let instrumentParameters;
  let i;
  let j;
  let k;
  let note;
  let sample;
  let patternChannel;
  let notFirstBeat;
  let stop;
  let instrument;
  let pitch;
  let attenuation;
  let outSampleOffset;
  let isSequenceEnd;
  let sampleOffset = 0;
  let nextSampleOffset;
  let sampleBuffer = [];
  let leftChannelBuffer = [];
  let rightChannelBuffer = [];
  let channelIndex = 0;
  let panning = 0;
  let hasMore = 1;
  let sampleCache = {};
  let beatLength = zzfxR / BPM * 60 >> 2;

  // for each channel in order until there are no more
  for (; hasMore; channelIndex++) {

    // reset current values
    sampleBuffer = [hasMore = notFirstBeat = pitch = outSampleOffset = 0];

    // for each pattern in sequence
    sequence.map((patternIndex, sequenceIndex) => {
      // get pattern for current channel, use empty 1 note pattern if none found
      patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];

      // check if there are more channels
      hasMore |= !!patterns[patternIndex][channelIndex];

      // get next offset, use the length of first channel
      nextSampleOffset = outSampleOffset + (patterns[patternIndex][0].length - 2 - !notFirstBeat) * beatLength;
      // for each beat in pattern, plus one extra if end of sequence
      isSequenceEnd = sequenceIndex == sequence.length - 1;
      for (i = 2, k = outSampleOffset; i < patternChannel.length + isSequenceEnd; notFirstBeat = ++i) {

        // <channel-note>
        note = patternChannel[i];

        // stop if end, different instrument or new note
        stop = i == patternChannel.length + isSequenceEnd - 1 && isSequenceEnd ||
            instrument != (patternChannel[0] || 0) | note | 0;

        // fill buffer with samples for previous beat, most cpu intensive part
        for (j = 0; j < beatLength && notFirstBeat;

            // fade off attenuation at end of beat if stopping note, prevents clicking
            j++ > beatLength - 99 && stop ? attenuation += (attenuation < 1) / 99 : 0
        ) {
          // copy sample to stereo buffers with panning
          sample = (1 - attenuation) * sampleBuffer[sampleOffset++] / 2 || 0;
          leftChannelBuffer[k] = (leftChannelBuffer[k] || 0) - sample * panning + sample;
          rightChannelBuffer[k] = (rightChannelBuffer[k++] || 0) + sample * panning + sample;
        }

        // set up for next note
        if (note) {
          // set attenuation
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          if (note |= 0) {
            // get cached sample
            sampleBuffer = sampleCache[
              [
                instrument = patternChannel[sampleOffset = 0] || 0,
                note
              ]
            ] = sampleCache[[instrument, note]] || (
                // add sample to cache
                instrumentParameters = [...instruments[instrument]],
                instrumentParameters[2] *= 2 ** ((note - 12) / 12),

                // allow negative values to stop notes
                note > 0 ? zzfxG(...instrumentParameters) : []
            );
          }
        }
      }

      // update the sample offset
      outSampleOffset = nextSampleOffset;
    });
  }

  return [leftChannelBuffer, rightChannelBuffer];
}
/*
    LittleJS Tile Layer System
    - Caches arrays of tiles to offscreen canvas for fast rendering
    - Unlimted numbers of layers, allocates canvases as needed
    - Interfaces with EngineObject for collision
    - Collision layer is separate from visible layers
    - Tile layers can be drawn to using their context with canvas2d
    - It is recommended to have a visible layer that matches the collision
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Tile Collision

let tileCollision = [];
let tileCollisionSize = vec2();
const tileLayerCanvasCache = [];

function initTileCollision(size)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

// set and get collision data
const setTileCollisionData = (pos, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
const getTileCollisionData = (pos)=>
    pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

// check if there is collision in a given area
function tileCollisionTest(pos, size=vec2(), object)
{
    const minX = max(Math.floor(pos.x - size.x*.5), 0);
    const minY = max(Math.floor(pos.y - size.y*.5), 0);
    const maxX = min(Math.floor(pos.x + size.x*.5), tileCollisionSize.x-1);
    const maxY = min(Math.floor(pos.y + size.y*.5), tileCollisionSize.y-1);
    for (let y = minY; y <= maxY; ++y)
    for (let x = minX; x <= maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, new Vector2(x, y))))
            return 1;
    }
}

// return the center of tile if any that is hit (this does not return the exact hit point)
// todo: a way to get the exact hit point, it must still register as inside the hit tile
function tileCollisionRaycast(posStart, posEnd, object)
{
    // test if a ray collides with tiles from start to end
    posStart = posStart.int();
    posEnd = posEnd.int();
    const posDelta = posEnd.subtract(posStart);
    const dx = abs(posDelta.x),  dy = -abs(posDelta.y);
    const sx = sign(posDelta.x), sy = sign(posDelta.y);
    let e = dx + dy;

    for (let x = posStart.x, y = posStart.y;;)
    {
        const tileData = getTileCollisionData(vec2(x,y));
        if (tileData && (object ? object.collideWithTileRaycast(tileData, new Vector2(x, y)) : tileData > 0))
        {
            debugRaycast && debugLine(posStart, posEnd, '#f00',.02, 1);
            debugRaycast && debugPoint(new Vector2(x+.5, y+.5), '#ff0', 1);
            return new Vector2(x+.5, y+.5);
        }

        // update Bresenham line drawing algorithm
        if (x == posEnd.x & y == posEnd.y) break;
        const e2 = 2*e;
        if (e2 >= dy) e += dy, x += sx;
        if (e2 <= dx) e += dx, y += sy;
    }
    debugRaycast && debugLine(posStart, posEnd, '#00f',.02, 1);
}

///////////////////////////////////////////////////////////////////////////////
// Tile Layer Rendering System

class TileLayerData
{
    constructor(tile=-1, direction=0, mirror=0, color=new Color)
    {
        this.tile      = tile;
        this.direction = direction;
        this.mirror    = mirror;
        this.color     = color;
    }
    clear() { this.tile = this.direction = this.mirror = 0; color = new Color; }
}

class TileLayer extends EngineObject
{
    constructor(pos, size, scale=vec2(1), layer=0)
    {
        super(pos, size);

        // create new canvas if necessary
        this.canvas = tileLayerCanvasCache.length ? tileLayerCanvasCache.pop() : document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        this.scale = scale;
        this.tileSize = defaultTileSize.copy();
        this.layer = layer;
        this.renderOrder = layer;
        this.flushGLBeforeRender = 1;

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData());
    }

    destroy()
    {
        // add canvas back to the cache
        tileLayerCanvasCache.push(this.canvas);
        super.destroy();
    }
    
    setData(layerPos, data, redraw)
    {
        if (layerPos.arrayCheck(this.size))
        {
            this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;
            redraw && this.drawTileData(layerPos);
        }
    }
    
    getData(layerPos)
    { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; }
    
    update() {} // tile layers are not updated
    render()
    {
        ASSERT(mainContext != this.context); // must call redrawEnd() after drawing tiles

        // flush and copy gl canvas because tile canvas does not use gl
        this.flushGLBeforeRender && glEnable && glCopyToContext(mainContext);
        
        // draw the entire cached level onto the main canvas
        const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y)));
        mainContext.drawImage
        (
            this.canvas, pos.x, pos.y,
            cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
        );
    }

    redraw()
    {
        // draw all the tile data to an offscreen canvas using webgl if possible
        this.redrawStart();
        this.drawAllTileData();
        this.redrawEnd();
    }

    redrawStart(clear = 1)
    {
        // clear and set size
        const width = this.size.x * this.tileSize.x;
        const height = this.size.y * this.tileSize.y;
        if (clear)
        {
            this.canvas.width  = width;
            this.canvas.height = height;
        }

        // save current render settings
        this.savedRenderSettings = [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos];

        // set camera transform for renering
        cameraScale = this.tileSize.x;
        cameraPos = this.size.scale(.5);
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art
        mainCanvasSize = vec2(width, height);
        glPreRender(width, height);
    }

    redrawEnd()
    {
        ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
        glCopyToContext(mainContext, 1);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos] = this.savedRenderSettings;
    }

    drawTileData(layerPos)
    {
        // first clear out where the tile was
        const pos = layerPos.int().add(this.pos).add(vec2(.5));
        this.drawCanvas2D(pos, vec2(1), 0, 0, (context)=>context.clearRect(-.5, -.5, 1, 1));

        // draw the tile
        const d = this.getData(layerPos);
        ASSERT(d.tile < 0 || mainContext == this.context); // must call redrawStart() before drawing tiles
        d.tile < 0 || drawTile(pos, vec2(1), d.tile || -1, this.tileSize, d.color, d.direction*PI/2, d.mirror);
    }

    drawAllTileData()
    {
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
             this.drawTileData(vec2(x,y));
    }

    // draw directly to the 2d canvas in world space (bipass webgl)
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileSize);
        size = size.multiply(this.tileSize);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror?-size.x:size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    // draw a tile directly onto the layer canvas
    drawTile(pos, size=vec2(1), tileIndex=0, tileSize=defaultTileSize, color=new Color, angle=0, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                const cols = tileImage.width/tileSize.x;
                context.globalAlpha = color.a; // full color not supported in this mode
                context.drawImage(tileImage, 
                    (tileIndex%cols)*tileSize.x, (tileIndex/cols|0)*tileSize.x, 
                    tileSize.x, tileSize.y, -.5, -.5, 1, 1);
            }
        });
    }

    drawRect(pos, size, color, angle) { this.drawTile(pos, size, -1, 0, color, angle, 0); }
}
/*
    LittleJS Particle System
    - Spawns particles with randomness from parameters
    - Updates particle physics
    - Fast particle rendering
*/

'use strict';

class ParticleEmitter extends EngineObject
{
    constructor
    ( 
        pos,                            // world space position of emitter
        emitSize = 0,                   // size of emitter (float for circle diameter, vec2 for rect)
        emitTime = 0,                   // how long to stay alive (0 is forever)
        emitRate = 100,                 // how many particles per second to spawn
        emitConeAngle = PI,             // local angle to apply velocity to particles from emitter
        tileIndex = -1,                 // index into tile sheet, if <0 no texture is applied
        tileSize = defaultTileSize,     // tile size for particles
        colorStartA = new Color,        // color at start of life
        colorStartB = new Color,        // randomized between start colors
        colorEndA = new Color(1,1,1,0), // color at end of life
        colorEndB = new Color(1,1,1,0), // randomized between end colors
        particleTime = .5,              // how long particles live
        sizeStart = .1,                 // how big are particles at start
        sizeEnd = 1,                    // how big are particles at end
        speed = .1,                     // how fast are particles when spawned
        angleSpeed = .05,               // how fast are particles rotating
        damping = 1,                    // how much to dampen particle speed
        angleDamping = 1,               // how much to dampen particle angular speed
        gravityScale = 0,               // how much does gravity effect particles
        particleConeAngle = PI,         // cone for start particle angle
        fadeRate = .1,                  // how quick to fade in particles at start/end in percent of life
        randomness = .2,                // apply extra randomness percent
        collideTiles,                   // do particles collide against tiles
        additive,                       // should particles use addtive blend
        randomColorLinear = 1,          // should color be randomized linearly or across each component
        renderOrder = additive ? 1e9 : 0// render order for particles (additive is above other stuff by default)
    )
    {
        super(pos, new Vector2, tileIndex, tileSize);

        // emitter settings
        this.emitSize = emitSize
        this.emitTime = emitTime;
        this.emitRate = emitRate;
        this.emitConeAngle = emitConeAngle;

        // color settings
        this.colorStartA = colorStartA;
        this.colorStartB = colorStartB;
        this.colorEndA   = colorEndA;
        this.colorEndB   = colorEndB;
        this.randomColorLinear = randomColorLinear;

        // particle settings
        this.particleTime      = particleTime;
        this.sizeStart         = sizeStart;
        this.sizeEnd           = sizeEnd;
        this.speed             = speed;
        this.angleSpeed        = angleSpeed;
        this.damping           = damping;
        this.angleDamping      = angleDamping;
        this.gravityScale      = gravityScale;
        this.particleConeAngle = particleConeAngle;
        this.fadeRate          = fadeRate;
        this.randomness        = randomness;
        this.collideTiles      = collideTiles;
        this.additive          = additive;
        this.renderOrder       = renderOrder;
        this.trailScale        =  
        this.emitTimeBuffer    = 0;
    }
    
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate)
            {
                const rate = 1/this.emitRate;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    }

    emitParticle()
    {
        // spawn a particle
        const pos = this.emitSize.x != undefined ? // check if vec2 was used for size
            (new Vector2(rand(-.5,.5), rand(-.5,.5))).multiply(this.emitSize).rotate(this.angle) // box emitter
            : randInCircle(this.emitSize * .5);                                                  // circle emitter
        const particle = new Particle(this.pos.add(pos), this.tileIndex, this.tileSize, 
            this.angle + rand(this.particleConeAngle, -this.particleConeAngle));

        // randomness scales each paremeter by a percentage
        const randomness = this.randomness;
        const randomizeScale = (v)=> v + v*rand(randomness, -randomness);

        // randomize particle settings
        const particleTime  = randomizeScale(this.particleTime);
        const sizeStart     = randomizeScale(this.sizeStart);
        const sizeEnd       = randomizeScale(this.sizeEnd);
        const speed         = randomizeScale(this.speed);
        const angleSpeed    = randomizeScale(this.angleSpeed) * randSign();
        const coneAngle     = rand(this.emitConeAngle, -this.emitConeAngle);
        const colorStart    = randColor(this.colorStartA, this.colorStartB, this.randomColorLinear);
        const colorEnd      = randColor(this.colorEndA,   this.colorEndB, this.randomColorLinear);

        // build particle settings
        particle.colorStart      = colorStart;
        particle.colorEndDelta   = colorEnd.subtract(colorStart);
        particle.velocity        = (new Vector2).setAngle(this.angle + coneAngle, speed);
        particle.angleVelocity   = angleSpeed;
        particle.lifeTime        = particleTime;
        particle.sizeStart       = sizeStart;
        particle.sizeEndDelta    = sizeEnd - sizeStart;
        particle.fadeRate        = this.fadeRate;
        particle.damping         = this.damping;
        particle.angleDamping    = this.angleDamping;
        particle.elasticity      = this.elasticity;
        particle.friction        = this.friction;
        particle.gravityScale    = this.gravityScale;
        particle.collideTiles    = this.collideTiles;
        particle.additive        = this.additive;
        particle.renderOrder     = this.renderOrder;
        particle.trailScale      = this.trailScale;
        particle.mirror          = rand()<.5;

        // setup callbacks for particles
        particle.destroyCallback = this.particleDestroyCallback;
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    render() {} // emitters are not rendered
}

///////////////////////////////////////////////////////////////////////////////
// particle object

class Particle extends EngineObject
{
    constructor(pos, tileIndex, tileSize, angle) { super(pos, new Vector2, tileIndex, tileSize, angle); }

    render()
    {
        // modulate size and color
        const p = min((time - this.spawnTime) / this.lifeTime, 1);
        const radius = this.sizeStart + p * this.sizeEndDelta;
        const size = new Vector2(radius, radius);
        const fadeRate = this.fadeRate*.5;
        const color = new Color(
            this.colorStart.r + p * this.colorEndDelta.r,
            this.colorStart.g + p * this.colorEndDelta.g,
            this.colorStart.b + p * this.colorEndDelta.b,
            (this.colorStart.a + p * this.colorEndDelta.a) * 
             (p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1)); // fade alpha

        // draw the particle
        this.additive && setBlendMode(1);
        if (this.trailScale)
        {
            // trail style particles
            const speed = this.velocity.length();
            const direction = this.velocity.scale(1/speed);
            const trailLength = speed * this.trailScale;
            size.y = max(size.x, trailLength);
            this.angle = direction.angle();
            drawTile(this.pos.add(direction.multiply(vec2(0,-trailLength*.5))), size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        }
        else
            drawTile(this.pos, size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        this.additive && setBlendMode()
        debugParticles && debugRect(this.pos, size, '#f005', 0, this.angle);

        if (p == 1)
        {
            // destroy particle when it's time runs out
            this.color = color;
            this.size = size;
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    }
}
/*
    LittleJS Medal System
    - Tracks and displays medals
    - Saves medals to local storage
    - Newgrounds and OS13k integration
*/

'use strict';

const medals = [], medalsDisplayQueue = [];
let medalsPreventUnlock, medalsGameName = engineName, medalsContext, medalsDisplayTimer, newgrounds;

function medalsInit(gameName, context, newgroundsAppID, newgroundsCipher)
{
    medalsGameName = gameName;
    medalsContext = context;

    // check if medals are unlocked
    debugMedals || medals.forEach(medal=> medal.unlocked = localStorage[medal.storageKey()]);

    // start up newgrounds only if requested
    if (newgroundsAppID)
        newgrounds = new Newgrounds(newgroundsAppID, newgroundsCipher);
}

class Medal
{
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(id >= 0 && !medals[id]);
        this.id = id;
        this.name = name;
        this.description = description;
        this.icon = icon;

        // add to list of medals
        medals[id] = this;

        if (src)
        {
            // load image
            this.image = new Image();
            this.image.src = src;
        }
    }

    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal
        localStorage[this.storageKey()] = this.unlocked = 1;
        medalsDisplayQueue.push(this);

        // save for newgrounds and OS13K
        newgrounds && newgrounds.unlockMedal(this.id);
        localStorage['OS13kTrophy,' + this.icon + ',' + medalsGameName + ',' + this.name] = this.description;
    }
 
    storageKey()
    {
        return medalsGameName + '_medal_' + this.id;
    }

    render(hidePercent=0)
    {
        const y = -medalDisplayHeight*hidePercent;

        // draw containing rect and clip to that region
        const context = medalsContext || mainContext;
        context.save();
        context.beginPath();
        context.fillStyle = '#ddd'
        context.fill(context.rect(0, y, medalDisplayWidth, medalDisplayHeight));
        context.strokeStyle = context.fillStyle = '#000';
        context.lineWidth = 2; 
        context.stroke();
        context.clip();

        // draw the image or icon
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '3em '+ defaultFont;
        if (this.image)
            context.drawImage(this.image, 15, y+(medalDisplayHeight-medalDisplayIconSize)/2, 
                medalDisplayIconSize, medalDisplayIconSize);
        else
            context.fillText(this.icon, 15+medalDisplayIconSize/2, y+medalDisplayHeight/2); // show icon if there is no image

        // draw the text
        context.textAlign = 'left';
        context.fillText(this.name, medalDisplayIconSize+25, y+35);
        context.font = '1.5em '+ defaultFont;
        context.restore(context.fillText(this.description, medalDisplayIconSize+25, y+70));
    }
}

// engine automatically renders medals
function medalsRender()
{
    if (!medalsDisplayQueue.length)
        return;
    
    // update first medal in queue
    const medal = medalsDisplayQueue[0];
    const time = realTime - medalsDisplayTimer;
    if (!medalsDisplayTimer)
        medalsDisplayTimer = realTime;
    else if (time > medalDisplayTime)
        medalsDisplayQueue.shift(medalsDisplayTimer = 0);
    else
    {
        // slide on/off medals
        const slideOffTime = medalDisplayTime - medalDisplaySlideTime;
        const hidePercent = 
            time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
            time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
        medal.render(hidePercent);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Newgrounds API wrapper

class Newgrounds
{
    constructor(app_id, cipher)
    {
        ASSERT(!newgrounds && app_id);
        this.app_id = app_id;
        this.cipher = cipher;

        // create an instance of CryptoJS for encrypted calls
        if (cipher)
            this.cryptoJS = CryptoJS();

        // get session id from url search params
        const url = new URL(window.location.href);
        this.session_id = url.searchParams.get('ngio_session_id') || 0;

        // get medals
        const medalsResult = this.call('Medal.getList', 0, 0);
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
        debugMedals && console.log(this.medals);
        for (const newgroundsMedal of this.medals)
        {
            const medal = medals[newgroundsMedal['id']];
            if (medal)
            {
                // copy newgrounds medal data
                medal.name = newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked = newgroundsMedal['unlocked'];
                medal.image = new Image();
                medal.image.src = newgroundsMedal['icon'];
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards', 0, 0);
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);
    }

    unlockMedal(id)
    {
        return this.call('Medal.unlock', {'id':id});
    }

    postScore(id, value)
    {
        return this.call('ScoreBoard.postScore', {'id':id, 'value':value});
    }

    getScores(id, user=0, social=0, skip=0, limit=10)
    {
        return this.call('ScoreBoard.getScores', 
            {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}, 0);
    }
    
    call(component, parameters=0, async=1)
    {
        // build the input object
        const input = 
        {
            'app_id':     this.app_id,
            'session_id': this.session_id,
            'call':       this.encryptCall({'component':component, 'parameters':parameters})
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));
        
        // send post data
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';
        xmlHttp.open('POST', url, !debugMedals && async);
        xmlHttp.send(formData);
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
    
    encryptCall(call)
    {
        if (!this.cipher)
            return call;
        
        // encrypt using AES-128 Base64 with cryptoJS
        const cryptoJS = this.cryptoJS;
        const aesKey = cryptoJS['enc']['Base64']['parse'](this.cipher);
        const iv = cryptoJS['lib']['WordArray']['random'](16);
        const encrypted = cryptoJS['AES']['encrypt'](JSON.stringify(call), aesKey, {'iv':iv});
        call['secure'] = cryptoJS['enc']['Base64']['stringify'](iv.concat(encrypted['ciphertext']));
        call['parameters'] = 0;
        return call;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Crypto-JS - https://github.com/brix/crypto-js [The MIT License (MIT)]
// Copyright (c) 2009-2013 Jeff Mott  Copyright (c) 2013-2016 Evan Vosberg

const CryptoJS=()=>eval(Function("[M='GBMGXz^oVYPPKKbB`agTXU|LxPc_ZBcMrZvCr~wyGfWrwk@ATqlqeTp^N?p{we}jIpEnB_sEr`l?YDkDhWhprc|Er|XETG?pTl`e}dIc[_N~}fzRycIfpW{HTolvoPB_FMe_eH~BTMx]yyOhv?biWPCGc]kABencBhgERHGf{OL`Dj`c^sh@canhy[secghiyotcdOWgO{tJIE^JtdGQRNSCrwKYciZOa]Y@tcRATYKzv|sXpboHcbCBf`}SKeXPFM|RiJsSNaIb]QPc[D]Jy_O^XkOVTZep`ONmntLL`Qz~UupHBX_Ia~WX]yTRJIxG`ioZ{fefLJFhdyYoyLPvqgH?b`[TMnTwwfzDXhfM?rKs^aFr|nyBdPmVHTtAjXoYUloEziWDCw_suyYT~lSMksI~ZNCS[Bex~j]Vz?kx`gdYSEMCsHpjbyxQvw|XxX_^nQYue{sBzVWQKYndtYQMWRef{bOHSfQhiNdtR{o?cUAHQAABThwHPT}F{VvFmgN`E@FiFYS`UJmpQNM`X|tPKHlccT}z}k{sACHL?Rt@MkWplxO`ASgh?hBsuuP|xD~LSH~KBlRs]t|l|_tQAroDRqWS^SEr[sYdPB}TAROtW{mIkE|dWOuLgLmJrucGLpebrAFKWjikTUzS|j}M}szasKOmrjy[?hpwnEfX[jGpLt@^v_eNwSQHNwtOtDgWD{rk|UgASs@mziIXrsHN_|hZuxXlPJOsA^^?QY^yGoCBx{ekLuZzRqQZdsNSx@ezDAn{XNj@fRXIwrDX?{ZQHwTEfu@GhxDOykqts|n{jOeZ@c`dvTY?e^]ATvWpb?SVyg]GC?SlzteilZJAL]mlhLjYZazY__qcVFYvt@|bIQnSno@OXyt]OulzkWqH`rYFWrwGs`v|~XeTsIssLrbmHZCYHiJrX}eEzSssH}]l]IhPQhPoQ}rCXLyhFIT[clhzYOvyHqigxmjz`phKUU^TPf[GRAIhNqSOdayFP@FmKmuIzMOeoqdpxyCOwCthcLq?n`L`tLIBboNn~uXeFcPE{C~mC`h]jUUUQe^`UqvzCutYCgct|SBrAeiYQW?X~KzCz}guXbsUw?pLsg@hDArw?KeJD[BN?GD@wgFWCiHq@Ypp_QKFixEKWqRp]oJFuVIEvjDcTFu~Zz]a{IcXhWuIdMQjJ]lwmGQ|]g~c]Hl]pl`Pd^?loIcsoNir_kikBYyg?NarXZEGYspt_vLBIoj}LI[uBFvm}tbqvC|xyR~a{kob|HlctZslTGtPDhBKsNsoZPuH`U`Fqg{gKnGSHVLJ^O`zmNgMn~{rsQuoymw^JY?iUBvw_~mMr|GrPHTERS[MiNpY[Mm{ggHpzRaJaoFomtdaQ_?xuTRm}@KjU~RtPsAdxa|uHmy}n^i||FVL[eQAPrWfLm^ndczgF~Nk~aplQvTUpHvnTya]kOenZlLAQIm{lPl@CCTchvCF[fI{^zPkeYZTiamoEcKmBMfZhk_j_~Fjp|wPVZlkh_nHu]@tP|hS@^G^PdsQ~f[RqgTDqezxNFcaO}HZhb|MMiNSYSAnQWCDJukT~e|OTgc}sf[cnr?fyzTa|EwEtRG|I~|IO}O]S|rp]CQ}}DWhSjC_|z|oY|FYl@WkCOoPuWuqr{fJu?Brs^_EBI[@_OCKs}?]O`jnDiXBvaIWhhMAQDNb{U`bqVR}oqVAvR@AZHEBY@depD]OLh`kf^UsHhzKT}CS}HQKy}Q~AeMydXPQztWSSzDnghULQgMAmbWIZ|lWWeEXrE^EeNoZApooEmrXe{NAnoDf`m}UNlRdqQ@jOc~HLOMWs]IDqJHYoMziEedGBPOxOb?[X`KxkFRg@`mgFYnP{hSaxwZfBQqTm}_?RSEaQga]w[vxc]hMne}VfSlqUeMo_iqmd`ilnJXnhdj^EEFifvZyxYFRf^VaqBhLyrGlk~qowqzHOBlOwtx?i{m~`n^G?Yxzxux}b{LSlx]dS~thO^lYE}bzKmUEzwW^{rPGhbEov[Plv??xtyKJshbG`KuO?hjBdS@Ru}iGpvFXJRrvOlrKN?`I_n_tplk}kgwSXuKylXbRQ]]?a|{xiT[li?k]CJpwy^o@ebyGQrPfF`aszGKp]baIx~H?ElETtFh]dz[OjGl@C?]VDhr}OE@V]wLTc[WErXacM{We`F|utKKjgllAxvsVYBZ@HcuMgLboFHVZmi}eIXAIFhS@A@FGRbjeoJWZ_NKd^oEH`qgy`q[Tq{x?LRP|GfBFFJV|fgZs`MLbpPYUdIV^]mD@FG]pYAT^A^RNCcXVrPsgk{jTrAIQPs_`mD}rOqAZA[}RETFz]WkXFTz_m{N@{W@_fPKZLT`@aIqf|L^Mb|crNqZ{BVsijzpGPEKQQZGlApDn`ruH}cvF|iXcNqK}cxe_U~HRnKV}sCYb`D~oGvwG[Ca|UaybXea~DdD~LiIbGRxJ_VGheI{ika}KC[OZJLn^IBkPrQj_EuoFwZ}DpoBRcK]Q}?EmTv~i_Tul{bky?Iit~tgS|o}JL_VYcCQdjeJ_MfaA`FgCgc[Ii|CBHwq~nbJeYTK{e`CNstKfTKPzw{jdhp|qsZyP_FcugxCFNpKitlR~vUrx^NrSVsSTaEgnxZTmKc`R|lGJeX}ccKLsQZQhsFkeFd|ckHIVTlGMg`~uPwuHRJS_CPuN_ogXe{Ba}dO_UBhuNXby|h?JlgBIqMKx^_u{molgL[W_iavNQuOq?ap]PGB`clAicnl@k~pA?MWHEZ{HuTLsCpOxxrKlBh]FyMjLdFl|nMIvTHyGAlPogqfZ?PlvlFJvYnDQd}R@uAhtJmDfe|iJqdkYr}r@mEjjIetDl_I`TELfoR|qTBu@Tic[BaXjP?dCS~MUK[HPRI}OUOwAaf|_}HZzrwXvbnNgltjTwkBE~MztTQhtRSWoQHajMoVyBBA`kdgK~h`o[J`dm~pm]tk@i`[F~F]DBlJKklrkR]SNw@{aG~Vhl`KINsQkOy?WhcqUMTGDOM_]bUjVd|Yh_KUCCgIJ|LDIGZCPls{RzbVWVLEhHvWBzKq|^N?DyJB|__aCUjoEgsARki}j@DQXS`RNU|DJ^a~d{sh_Iu{ONcUtSrGWW@cvUjefHHi}eSSGrNtO?cTPBShLqzwMVjWQQCCFB^culBjZHEK_{dO~Q`YhJYFn]jq~XSnG@[lQr]eKrjXpG~L^h~tDgEma^AUFThlaR{xyuP@[^VFwXSeUbVetufa@dX]CLyAnDV@Bs[DnpeghJw^?UIana}r_CKGDySoRudklbgio}kIDpA@McDoPK?iYcG?_zOmnWfJp}a[JLR[stXMo?_^Ng[whQlrDbrawZeSZ~SJstIObdDSfAA{MV}?gNunLOnbMv_~KFQUAjIMj^GkoGxuYtYbGDImEYiwEMyTpMxN_LSnSMdl{bg@dtAnAMvhDTBR_FxoQgANniRqxd`pWv@rFJ|mWNWmh[GMJz_Nq`BIN@KsjMPASXORcdHjf~rJfgZYe_uulzqM_KdPlMsuvU^YJuLtofPhGonVOQxCMuXliNvJIaoC?hSxcxKVVxWlNs^ENDvCtSmO~WxI[itnjs^RDvI@KqG}YekaSbTaB]ki]XM@[ZnDAP~@|BzLRgOzmjmPkRE@_sobkT|SszXK[rZN?F]Z_u}Yue^[BZgLtR}FHzWyxWEX^wXC]MJmiVbQuBzkgRcKGUhOvUc_bga|Tx`KEM`JWEgTpFYVeXLCm|mctZR@uKTDeUONPozBeIkrY`cz]]~WPGMUf`MNUGHDbxZuO{gmsKYkAGRPqjc|_FtblEOwy}dnwCHo]PJhN~JoteaJ?dmYZeB^Xd?X^pOKDbOMF@Ugg^hETLdhwlA}PL@_ur|o{VZosP?ntJ_kG][g{Zq`Tu]dzQlSWiKfnxDnk}KOzp~tdFstMobmy[oPYjyOtUzMWdjcNSUAjRuqhLS@AwB^{BFnqjCmmlk?jpn}TksS{KcKkDboXiwK]qMVjm~V`LgWhjS^nLGwfhAYrjDSBL_{cRus~{?xar_xqPlArrYFd?pHKdMEZzzjJpfC?Hv}mAuIDkyBxFpxhstTx`IO{rp}XGuQ]VtbHerlRc_LFGWK[XluFcNGUtDYMZny[M^nVKVeMllQI[xtvwQnXFlWYqxZZFp_|]^oWX[{pOMpxXxvkbyJA[DrPzwD|LW|QcV{Nw~U^dgguSpG]ClmO@j_TENIGjPWwgdVbHganhM?ema|dBaqla|WBd`poj~klxaasKxGG^xbWquAl~_lKWxUkDFagMnE{zHug{b`A~IYcQYBF_E}wiA}K@yxWHrZ{[d~|ARsYsjeNWzkMs~IOqqp[yzDE|WFrivsidTcnbHFRoW@XpAV`lv_zj?B~tPCppRjgbbDTALeFaOf?VcjnKTQMLyp{NwdylHCqmo?oelhjWuXj~}{fpuX`fra?GNkDiChYgVSh{R[BgF~eQa^WVz}ATI_CpY?g_diae]|ijH`TyNIF}|D_xpmBq_JpKih{Ba|sWzhnAoyraiDvk`h{qbBfsylBGmRH}DRPdryEsSaKS~tIaeF[s]I~xxHVrcNe@Jjxa@jlhZueLQqHh_]twVMqG_EGuwyab{nxOF?`HCle}nBZzlTQjkLmoXbXhOtBglFoMz?eqre`HiE@vNwBulglmQjj]DB@pPkPUgA^sjOAUNdSu_`oAzar?n?eMnw{{hYmslYi[TnlJD'",...']charCodeAtUinyxpf',"for(;e<10359;c[e++]=p-=128,A=A?p-A&&A:p==34&&p)for(p=1;p<128;y=f.map((n,x)=>(U=r[n]*2+1,U=Math.log(U/(h-U)),t-=a[x]*U,U/500)),t=~-h/(1+Math.exp(t))|1,i=o%h<t,o=o%h+(i?t:h-t)*(o>>17)-!i*t,f.map((n,x)=>(U=r[n]+=(i*h/2-r[n]<<13)/((C[n]+=C[n]<5)+1/20)>>13,a[x]+=y[x]*(i-t/h))),p=p*2+i)for(f='010202103203210431053105410642065206541'.split(t=0).map((n,x)=>(U=0,[...n].map((n,x)=>(U=U*997+(c[e-n]|0)|0)),h*32-1&U*997+p+!!A*129)*12+x);o<h*32;o=o*64|M.charCodeAt(d++)&63);for(C=String.fromCharCode(...c);r=/[\0-#?@\\\\~]/.exec(C);)with(C.split(r))C=join(shift());return C")([],[],1<<17,[0,0,0,0,0,0,0,0,0,0,0,0],new Uint16Array(51e6).fill(1<<15),new Uint8Array(51e6),0,0,0,0));
/*
    LittleJS WebGL Interface
    - All webgl used by the engine is wrapped up here
    - Can be disabled with glEnable to revert to 2D canvas rendering
    - Batches sprite rendering on GPU for incredibly fast performance
    - Sprite transform math is done in the shader where possible
    - For normal stuff you won't need to call any functions in this file
    - For advanced stuff there are helper functions to create shaders, textures, etc
*/

'use strict';

let glCanvas, glContext, glTileTexture, glActiveTexture, glShader, 
    glPositionData, glColorData, glBatchCount, glDirty, glAdditive;

function glInit()
{
    if (!glEnable) return;

    // create the canvas and tile texture
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl');
    glTileTexture = glCreateTexture(tileImage);

    if (glOverlay)
    {
        // firefox is much faster without copying the gl buffer so we just overlay it with some tradeoffs
        document.body.appendChild(glCanvas);
        glCanvas.style = mainCanvas.style.cssText;
    }

    // setup vertex and fragment shaders
    glShader = glCreateProgram(
        'precision lowp float;'+    // use lowp for better performance
        'uniform mat4 m;'+          // transform matrix
        'attribute float a;'+       // angle
        'attribute vec2 p,s,t;'+    // position, size, uv
        'attribute vec4 c,b;'+      // color, additiveColor
        'varying vec2 v;'+          // return uv
        'varying vec4 d,e;'+        // return color, additiveColor
        'void main(){'+             // shader entry point
        'gl_Position=m*vec4((s*cos(a)-vec2(-s.y,s)*sin(a))*.5+p,1,1);'+// transform position
        'v=t;d=c;e=b;'+             // pass stuff to fragment shader
        '}'                         // end of shader
        ,
        'precision lowp float;'+             // use lowp for better performance
        'varying vec2 v;'+                   // uv
        'varying vec4 d,e;'+                 // color, additiveColor
        'uniform sampler2D j;'+              // texture
        'void main(){'+                      // shader entry point
        'gl_FragColor=texture2D(j,v)*d+e;'+  // modulate texture by color plus additive
        '}'                                  // end of shader
    );

    // init buffers
    const glVertexData = new ArrayBuffer(gl_MAX_BATCH * gl_VERTICES_PER_QUAD * gl_VERTEX_BYTE_STRIDE);
    glCreateBuffer(gl_ARRAY_BUFFER, glVertexData.byteLength, gl_DYNAMIC_DRAW);
    glPositionData = new Float32Array(glVertexData);
    glColorData = new Uint32Array(glVertexData);

    // setup the vertex data array
    const initVertexAttribArray = (name, type, typeSize, size, normalize=0)=>
    {
        const location = glContext.getAttribLocation(glShader, name);
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, gl_VERTEX_BYTE_STRIDE, offset);
        offset += size*typeSize;
    }
    let offset = glDirty = glBatchCount = 0;
    initVertexAttribArray('a', gl_FLOAT, 4, 1);            // angle
    initVertexAttribArray('p', gl_FLOAT, 4, 2);            // position
    initVertexAttribArray('s', gl_FLOAT, 4, 2);            // size
    initVertexAttribArray('t', gl_FLOAT, 4, 2);            // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4, 1); // color
    initVertexAttribArray('b', gl_UNSIGNED_BYTE, 1, 4, 1); // additiveColor
}

function glSetBlendMode(additive)
{
    if (!glEnable) return;
        
    if (additive != glAdditive)
        glFlush();

    // setup blending
    glAdditive = additive;
    const destBlend = additive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);
}

function glSetTexture(texture=glTileTexture)
{
    if (!glEnable) return;
        
    if (texture != glActiveTexture)
        glFlush();

    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
}

function glCompileShader(source, type)
{
    if (!glEnable) return;

    // build the shader
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    // check for errors
    if (debug && !glContext.getShaderParameter(shader, gl_COMPILE_STATUS))
        throw glContext.getShaderInfoLog(shader);
    return shader;
}

function glCreateProgram(vsSource, fsSource)
{
    if (!glEnable) return;

    // build the program
    const program = glContext.createProgram();
    glContext.attachShader(program, glCompileShader(vsSource, gl_VERTEX_SHADER));
    glContext.attachShader(program, glCompileShader(fsSource, gl_FRAGMENT_SHADER));
    glContext.linkProgram(program);

    // check for errors
    if (debug && !glContext.getProgramParameter(program, gl_LINK_STATUS))
        throw glContext.getProgramInfoLog(program);
    return program;
}

function glCreateBuffer(bufferType, size, usage)
{
    if (!glEnable) return;

    // build the buffer
    const buffer = glContext.createBuffer();
    glContext.bindBuffer(bufferType, buffer);
    glContext.bufferData(bufferType, size, usage);
    return buffer;
}

function glCreateTexture(image)
{
    if (!glEnable) return;

    // build the texture
    const texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);

    // use point filtering for pixelated rendering
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_S, gl_CLAMP_TO_EDGE);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_T, gl_CLAMP_TO_EDGE);
    return texture;
}

function glPreRender(width, height)
{
    if (!glEnable) return;

    // clear and set to same size as main canvas
    glCanvas.width = width;
    glCanvas.height = height;
    glContext.viewport(0, 0, width, height);

    // set up the shader
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = glTileTexture);
    glContext.useProgram(glShader);
    glSetBlendMode();

    // build the transform matrix
    const sx = 2 * cameraScale / width;
    const sy = 2 * cameraScale / height;
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), 0,
        new Float32Array([
            sx, 0, 0, 0,
            0, sy, 0, 0,
            1, 1, -1, 1,
            -1-sx*cameraPos.x, -1-sy*cameraPos.y, 0, 0
        ])
    );
}

function glFlush()
{
    if (!glEnable || !glBatchCount) return;

    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, 
        glPositionData.subarray(0, glBatchCount * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT));
    glContext.drawArrays(gl_TRIANGLES, 0, glBatchCount * gl_VERTICES_PER_QUAD);
    glBatchCount = 0;
}

function glCopyToContext(context, forceDraw)
{
    if (!glEnable || !glDirty)  return;
    
    // draw any sprites still in the buffer, copy to main canvas and clear
    glFlush();

    if (!glOverlay || forceDraw)
    {
        // do not draw/clear in overlay mode because the canvas is visible
        context.drawImage(glCanvas, 0, glAdditive = glDirty = 0);
        glContext.clear(gl_COLOR_BUFFER_BIT);
    }
}

function glDraw(x, y, sizeX, sizeY, angle=0, uv0X=0, uv0Y=0, uv1X=1, uv1Y=1, rgba=0xffffffff, rgbaAdditive=0x00000000)
{
    if (!glEnable) return;
    
    // flush if there is no room for more verts
    if (glBatchCount == gl_MAX_BATCH)
        glFlush();
        
    // setup 2 triangles to form a quad
    let offset = glBatchCount++ * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT;
    glDirty = 1;

    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 2
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    
    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;

    // vertex 3
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;

    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
}

///////////////////////////////////////////////////////////////////////////////
// store gl constants as integers so their name doesn't use space in minifed
const 
gl_ONE = 1,
gl_TRIANGLES = 4,
gl_SRC_ALPHA = 770,
gl_ONE_MINUS_SRC_ALPHA = 771,
gl_BLEND = 3042,
gl_TEXTURE_2D = 3553,
gl_UNSIGNED_BYTE = 5121,
gl_FLOAT = 5126,
gl_RGBA = 6408,
gl_NEAREST = 9728,
gl_LINEAR = 9729,
gl_TEXTURE_MAG_FILTER = 10240,
gl_TEXTURE_MIN_FILTER = 10241,
gl_TEXTURE_WRAP_S = 10242,
gl_TEXTURE_WRAP_T = 10243,
gl_COLOR_BUFFER_BIT = 16384,
gl_CLAMP_TO_EDGE = 33071,
gl_ARRAY_BUFFER = 34962,
gl_DYNAMIC_DRAW = 35048,
gl_FRAGMENT_SHADER = 35632, 
gl_VERTEX_SHADER = 35633,
gl_COMPILE_STATUS = 35713,
gl_LINK_STATUS = 35714,

// constants for batch rendering
gl_VERTICES_PER_QUAD = 6,
gl_INDICIES_PER_VERT = 9,
gl_MAX_BATCH = 1<<16,
gl_VERTEX_BYTE_STRIDE = 4 + (4 * 2) * 3 + (4) * 2; // float + vec2 * 3 + (char * 4) * 2
