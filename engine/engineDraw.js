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
function drawCanvas2D(pos, size, angle, mirror, drawFunction, context = mainContext)
{
    // create canvas transform from world space to screen space
    pos = worldToScreen(pos);
    size = size.scale(cameraScale);
    context.save();
    context.translate(pos.x+.5|0, pos.y-.5|0);
    context.rotate(angle);
    context.scale(mirror?-size.x:size.x, size.y);
    drawFunction(context);
    context.restore();
}

// draw text on overlay canvas in world space
function drawText(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=defaultFont)
{
    pos = worldToScreen(pos);
    overlayContext.font = size*cameraScale + 'px '+ font;
    overlayContext.textAlign = textAlign;
    overlayContext.textBaseline = 'middle';
    if (lineWidth)
    {
        overlayContext.lineWidth = lineWidth*cameraScale;
        overlayContext.strokeStyle = lineColor.rgba();
        overlayContext.strokeText(text, pos.x, pos.y);
    }
    overlayContext.fillStyle = color.rgba();
    overlayContext.fillText(text, pos.x, pos.y);
}

// enable additive or regular blend mode
function setBlendMode(additive)
{
    glEnable ? glSetBlendMode(additive) : mainContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}