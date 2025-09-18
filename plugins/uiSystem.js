/**
 * LittleJS User Interface Plugin
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 * @namespace UISystemPlugin
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// ui defaults

/** Default fill color for UI elements
 *  @type {Color}
 *  @memberof UISystemPlugin */
let uiDefaultColor       = WHITE;

/** Default outline color for UI elements
 *  @type {Color}
 *  @memberof UISystemPlugin */
let uiDefaultLineColor   = BLACK;

/** Default text color for UI elements
 *  @type {Color}
 *  @memberof UISystemPlugin */
let uiDefaultTextColor   = BLACK;

/** Default button color for UI elements
 *  @type {Color}
 *  @memberof UISystemPlugin */
let uiDefaultButtonColor = hsl(0,0,.5);

/** Default hover color for UI elements
 *  @type {Color}
 *  @memberof UISystemPlugin */
let uiDefaultHoverColor  = hsl(0,0,.7);

/** Default line width for UI elements
 *  @type {number}
 *  @memberof UISystemPlugin */
let uiDefaultLineWidth = 4;

/** Default font for UI elements
 *  @type {string}
 *  @memberof UISystemPlugin */
let uiDefaultFont = 'arial';

/** List of all UI elements
 *  @type {Array<UIObject>}
 *  @memberof UISystemPlugin */
let uiObjects = [];

/** Context to render UI elements to
 *  @type {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}
 *  @memberof UISystemPlugin */
let uiContext;

/** Set up the UI system, typically called in gameInit
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @memberof UISystemPlugin */
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

/** Draw a rectangle to the UI context
 *  @param {Vector2} pos
 *  @param {Vector2} size
 *  @param {Color}   [color=uiDefaultColor]
 *  @param {number}  [lineWidth=uiDefaultLineWidth]
 *  @param {Color}   [lineColor=uiDefaultLineColor]
 *  @memberof UISystemPlugin */
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

/** Draw a line to the UI context
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [lineWidth=uiDefaultLineWidth]
 *  @param {Color}   [lineColor=uiDefaultLineColor]
 *  @memberof UISystemPlugin */
function drawUILine(posA, posB, lineWidth=uiDefaultLineWidth, lineColor=uiDefaultLineColor)
{
    uiContext.strokeStyle = lineColor.toString();
    uiContext.lineWidth = lineWidth;
    uiContext.beginPath();
    uiContext.lineTo(posA.x, posA.y);
    uiContext.lineTo(posB.x, posB.y);
    uiContext.stroke();
}

/** Draw a tile to the UI context
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {TileInfo} tileInfo
 *  @param {Color}    [color=uiDefaultColor]
 *  @param {number}   [angle]
 *  @param {boolean}  [mirror]
 *  @memberof UISystemPlugin */
function drawUITile(pos, size, tileInfo, color=uiDefaultColor, angle=0, mirror=false)
{
    drawTile(pos, size, tileInfo, color, angle, mirror, BLACK, false, true, uiContext);
}

/** Draw text to the UI context
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {Vector2} size
 *  @param {Color}   [color=uiDefaultColor]
 *  @param {number}  [lineWidth=uiDefaultLineWidth]
 *  @param {Color}   [lineColor=uiDefaultLineColor]
 *  @param {string}  [align]
 *  @param {string}  [font=uiDefaultFont]
 *  @memberof UISystemPlugin */
function drawUIText(text, pos, size, color=uiDefaultColor, lineWidth=uiDefaultLineWidth, lineColor=uiDefaultLineColor, align='center', font=uiDefaultFont)
{
    drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, size.x, uiContext);
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI Object - Base level object for all UI elements
 */
class UIObject
{
    /** Create a UIObject
     *  @param {Vector2}  [pos=(0,0)]
     *  @param {Vector2}  [size=(1,1)]
     */
    constructor(pos=vec2(), size=vec2())
    {
        /** @property {Vector2} - Local position of the object */
        this.localPos   = pos.copy();
        /** @property {Vector2} - Screen space position of the object */
        this.pos        = pos.copy();
        /** @property {Vector2} - Screen space size of the object */
        this.size       = size.copy();
        /** @property {Color} */
        this.color      = uiDefaultColor;
        /** @property {Color} */
        this.lineColor  = uiDefaultLineColor;
        /** @property {Color} */
        this.textColor  = uiDefaultTextColor;
        /** @property {Color} */
        this.hoverColor = uiDefaultHoverColor;
        /** @property {number} */
        this.lineWidth  = uiDefaultLineWidth;
        /** @property {string} */
        this.font       = uiDefaultFont;
        /** @property {boolean} */
        this.visible    = true;
        /** @property {Array<UIObject>} */
        this.children   = [];
        /** @property {UIObject} */
        this.parent     = undefined;
        uiObjects.push(this);
    }

    /** Add a child UIObject to this object
     *  @param {UIObject} child
     */
    addChild(child)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
    }

    /** Remove a child UIObject from this object
     *  @param {UIObject} child
     */
    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = undefined;
    }

    /** Update the object, called automatically by plugin once each frame */
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

    /** Render the object, called automatically by plugin once each frame */
    render()
    {
        if (this.size.x && this.size.y)
            drawUIRect(this.pos, this.size, this.color, this.lineWidth, this.lineColor);
    }

    /** Called when the mouse enters the object */
    onEnter()   {}

    /** Called when the mouse leaves the object */
    onLeave()   {}

    /** Called when the mouse is pressed while over the object */
    onPress()   {}

    /** Called when the mouse is released while over the object */
    onRelease() {}

    /** Called when the state of this object changes */
    onChange()  {}
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIText - A UI object that displays text
 * @extends UIObject
 */
class UIText extends UIObject
{
    /** Create a UIText object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string}  [text]
     *  @param {string}  [align]
     *  @param {string}  [font=uiDefaultFont]
     */
    constructor(pos, size, text='', align='center', font=uiDefaultFont)
    {
        super(pos, size);

        /** @property {string} */
        this.text = text;
        /** @property {string} */
        this.align = align;

        this.font = font; // set font
        this.lineWidth = 0; // set text to not be outlined by default
    }
    render()
    {
        drawUIText(this.text, this.pos, this.size, this.textColor, this.lineWidth, this.lineColor, this.align, this.font);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UITile - A UI object that displays a tile image
 * @extends UIObject
 */
class UITile extends UIObject
{
    /** Create a UITile object
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=WHITE]
     *  @param {number}   [angle]
     *  @param {boolean}  [mirror]
     */
    constructor(pos, size, tileInfo, color=WHITE, angle=0, mirror=false)
    {
        super(pos, size);

        /** @property {TileInfo} - Tile image to use */
        this.tileInfo = tileInfo;
        /** @property {number} - Angle to rotate in radians */
        this.angle = angle;
        /** @property {boolean} - Should it be mirrored? */
        this.mirror = mirror;
        this.color = color;
    }
    render()
    {
        drawUITile(this.pos, this.size, this.tileInfo, this.color, this.angle, this.mirror);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIButton - A UI object that acts as a button
 * @extends UIObject
 */
class UIButton extends UIObject
{
    /** Create a UIButton object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiDefaultButtonColor]
     */
    constructor(pos, size, text='', color=uiDefaultButtonColor)
    {
        super(pos, size);

        /** @property {string} */
        this.text = text;
        this.color = color;
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
/** 
 * UICheckbox - A UI object that acts as a checkbox
 * @extends UIObject
 */
class UICheckbox extends UIObject
{
    /** Create a UICheckbox object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {boolean} [checked]
     */
    constructor(pos, size, checked=false)
    {
        super(pos, size);

        /** @property {boolean} */
        this.checked = checked;
    }
    onPress()
    {
        this.checked = !this.checked;
        this.onChange();
    }
    render()
    {
        const color = this.mouseIsOver? this.hoverColor : this.color;
        drawUIRect(this.pos, this.size, color, this.lineWidth, this.lineColor);
        if (this.checked)
        {
            // draw an X if checked
            drawUILine(this.pos.add(this.size.multiply(vec2(-.5,-.5))), this.pos.add(this.size.multiply(vec2(.5,.5))), this.lineWidth, this.lineColor);
            drawUILine(this.pos.add(this.size.multiply(vec2(-.5,.5))), this.pos.add(this.size.multiply(vec2(.5,-.5))), this.lineWidth, this.lineColor);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIScrollbar - A UI object that acts as a scrollbar
 * @extends UIObject
 */
class UIScrollbar extends UIObject
{
    /** Create a UIScrollbar object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {number}  [value]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiDefaultButtonColor]
     *  @param {Color}   [handleColor=WHITE]
     */
    constructor(pos, size, value=.5, text='', color=uiDefaultButtonColor, handleColor=WHITE)
    {
        super(pos, size);

        /** @property {number} */
        this.value = value;
        /** @property {string} */
        this.text = text;
        this.color = color;
        this.handleColor = handleColor;
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