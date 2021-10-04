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