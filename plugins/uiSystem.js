/**
 * LittleJS User Interface Plugin
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// ui defaults
let uiDefaultColor       = WHITE;
let uiDefaultLineColor   = BLACK;
let uiDefaultTextColor   = BLACK;
let uiDefaultButtonColor = hsl(0,0,.5);
let uiDefaultHoverColor  = hsl(0,0,.7);
let uiDefaultLineWidth   = 4;
let uiDefaultFont        = 'arial';

// ui system
let uiObjects = [];
let uiContext;

function initUISystem(context=overlayContext)
{
    uiContext = context;
    engineAddPlugin(uiUpdate, uiRender);

    // setup recursive update and render
    function uiUpdate()
    {
        function updateObject(o)
        {
            if (!o.visible)
                return;
            if (o.parent)
                o.pos = o.localPos.add(o.parent.pos);
            o.update();
            for(const c of o.children)
                updateObject(c);
        }
        uiObjects.forEach(o=> o.parent || updateObject(o));
    }
    function uiRender()
    {
        function renderObject(o)
        {
            if (!o.visible)
                return;
            if (o.parent)
                o.pos = o.localPos.add(o.parent.pos);
            o.render();
            for(const c of o.children)
                renderObject(c);
        }
        uiObjects.forEach(o=> o.parent || renderObject(o));
    }
}

function drawUIRect(pos, size, color=uiDefaultColor, lineWidth=uiDefaultLineWidth, lineColor=uiDefaultLineColor)
{
    uiContext.fillStyle = color.toString();
    uiContext.beginPath();
    uiContext.rect(pos.x-size.x/2, pos.y-size.y/2, size.x, size.y);
    uiContext.fill();
    if (lineWidth)
    {
        uiContext.strokeStyle = lineColor.toString();
        uiContext.lineWidth = lineWidth;
        uiContext.stroke();
    }
}

function drawUILine(posA, posB, thickness=uiDefaultLineWidth, color=uiDefaultLineColor)
{
    uiContext.strokeStyle = color.toString();
    uiContext.lineWidth = thickness;
    uiContext.beginPath();
    uiContext.lineTo(posA.x, posA.y);
    uiContext.lineTo(posB.x, posB.y);
    uiContext.stroke();
}

function drawUITile(pos, size, tileInfo, color=uiDefaultColor, angle=0, mirror=false)
{
    drawTile(pos, size, tileInfo, color, angle, mirror, BLACK, false, true, uiContext);
}

function drawUIText(text, pos, size, color=uiDefaultColor, lineWidth=uiDefaultLineWidth, lineColor=uiDefaultLineColor, align='center', font=uiDefaultFont)
{
    drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, uiContext, size.x);
}

///////////////////////////////////////////////////////////////////////////////

class UIObject
{
    constructor(localPos=vec2(), size=vec2())
    {
        this.localPos = localPos.copy();
        this.pos = localPos.copy();
        this.size = size.copy();
        this.color      = uiDefaultColor;
        this.lineColor  = uiDefaultLineColor;
        this.textColor  = uiDefaultTextColor;
        this.hoverColor = uiDefaultHoverColor;
        this.lineWidth  = uiDefaultLineWidth;
        this.font       = uiDefaultFont;
        this.visible = true;
        this.children = [];
        this.parent = null;
        uiObjects.push(this);
    }

    addChild(child)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
    }

    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    update()
    {
        // track mouse input
        const mouseWasOver = this.mouseIsOver;
        const mouseDown = mouseIsDown(0);
        if (!mouseDown || isTouchDevice)
        {
            this.mouseIsOver = isOverlapping(this.pos, this.size, mousePosScreen);
            if (!mouseDown && isTouchDevice)
                this.mouseIsOver = false;
            if (this.mouseIsOver && !mouseWasOver)
                this.onEnter();
            if (!this.mouseIsOver && mouseWasOver)
                this.onLeave();
        }
        if (mouseWasPressed(0) && this.mouseIsOver)
        {
            this.mouseIsHeld = true;
            this.onPress();
            if (isTouchDevice)
                this.mouseIsOver = false;
        }
        else if (this.mouseIsHeld && !mouseDown)
        {
            this.mouseIsHeld = false;
            this.onRelease();
        }
    }
    render()
    {
        if (this.size.x && this.size.y)
            drawUIRect(this.pos, this.size, this.color, this.lineWidth, this.lineColor);
    }

    // callback functions
    onEnter()   {}
    onLeave()   {}
    onPress()   {}
    onRelease() {}
    onChange()  {}
}

///////////////////////////////////////////////////////////////////////////////

class UIText extends UIObject
{
    constructor(pos, size, text='', align='center', font=fontDefault)
    {
        super(pos, size);

        this.text = text;
        this.align = align;
        this.font = font;
        this.lineWidth = 0;
    }
    render()
    {
        drawUIText(this.text, this.pos, this.size, this.textColor, this.lineWidth, this.lineColor, this.align, this.font);
    }
}

///////////////////////////////////////////////////////////////////////////////

class UITile extends UIObject
{
    constructor(pos, size, tileInfo, color=WHITE, angle=0, mirror=false)
    {
        super(pos, size);

        this.tileInfo = tileInfo;
        this.color = color;
        this.angle = angle;
        this.mirror = mirror;
    }
    render()
    {
        drawUITile(this.pos, this.size, this.tileInfo, this.color, this.angle, this.mirror);
    }
}

///////////////////////////////////////////////////////////////////////////////

class UIButton extends UIObject
{
    constructor(pos, size, text)
    {
        super(pos, size);
        this.text = text;
        this.color = uiDefaultButtonColor;
    }
    render()
    {
        const lineColor = this.mouseIsHeld ? this.color : this.lineColor;
        const color = this.mouseIsOver? this.hoverColor : this.color;
        drawUIRect(this.pos, this.size, color, this.lineWidth, lineColor);
        const textSize = vec2(this.size.x, this.size.y*.8);
        drawUIText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font);
    }
}

///////////////////////////////////////////////////////////////////////////////

class UICheckbox extends UIObject
{
    constructor(pos, size, checked=false)
    {
        super(pos, size);
        this.checked = checked;
    }
    onPress()
    {
        this.checked = !this.checked;
        this.onChange();
    }
    render()
    {
        drawUIRect(this.pos, this.size, this.color, this.lineWidth, this.lineColor);
        if (this.checked)
        {
            // draw an X if checked
            drawUILine(this.pos.add(this.size.multiply(vec2(-.5,-.5))), this.pos.add(this.size.multiply(vec2(.5,.5))), this.lineWidth, this.lineColor);
            drawUILine(this.pos.add(this.size.multiply(vec2(-.5,.5))), this.pos.add(this.size.multiply(vec2(.5,-.5))), this.lineWidth, this.lineColor);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class UIScrollbar extends UIObject
{
    constructor(pos, size, value=.5, text='')
    {
        super(pos, size);
        this.value = value;
        this.text = text;
        this.color = uiDefaultButtonColor;
        this.handleColor = WHITE;
    }
    update()
    {
        super.update();
        if (this.mouseIsHeld)
        {
            const handleSize = vec2(this.size.y);
            const handleWidth = this.size.x - handleSize.x;
            const p1 = this.pos.x - handleWidth/2;
            const p2 = this.pos.x + handleWidth/2;
            const oldValue = this.value;
            this.value = percent(mousePosScreen.x, p1, p2);
            this.value == oldValue || this.onChange();
        }
    }
    render()
    {
        const lineColor = this.mouseIsHeld ? this.color : this.lineColor;
        const color = this.mouseIsOver? this.hoverColor : this.color;
        drawUIRect(this.pos, this.size, color, this.lineWidth, lineColor);
    
        const handleSize = vec2(this.size.y);
        const handleWidth = this.size.x - handleSize.x;
        const p1 = this.pos.x - handleWidth/2;
        const p2 = this.pos.x + handleWidth/2;
        const handlePos = vec2(lerp(this.value, p1, p2), this.pos.y);
        const barColor = this.mouseIsHeld ? this.color : this.handleColor;
        drawUIRect(handlePos, handleSize, barColor, this.lineWidth, this.lineColor);

        const textSize = vec2(this.size.x, this.size.y*.8);
        drawUIText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font);
    }
}