/**
 * LittleJS User Interface Plugin
 * - call new UISystemPlugin() to setup the UI system
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global UI system plugin object
 *  @type {UISystemPlugin} */
let uiSystem;

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI System Global Object
 */
class UISystemPlugin
{
    /** Create the global UI system object
     *  @param {CanvasRenderingContext2D} [context]
     *  @example
     *  // create the ui plugin object
     *  new UISystemPlugin;
     */
    constructor(context=overlayContext)
    {
        ASSERT(!uiSystem, 'UI system already initialized');
        uiSystem = this;

        /** @property {Color} - Default fill color for UI elements */
        this.defaultColor = WHITE;
        /** @property {Color} - Default outline color for UI elements */
        this.defaultLineColor = BLACK;
        /** @property {Color} - Default text color for UI elements */
        this.defaultTextColor = BLACK;
        /** @property {Color} - Default button color for UI elements */
        this.defaultButtonColor = hsl(0,0,.5);
        /** @property {Color} - Default hover color for UI elements */
        this.defaultHoverColor = hsl(0,0,.7);
        /** @property {number} - Default line width for UI elements */
        this.defaultLineWidth = 4;
        /** @property {string} - Default font for UI elements */
        this.defaultFont = 'arial';
        /** @property {Array<UIObject>} - List of all UI elements */
        this.uiObjects = [];
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - Context to render UI elements to */
        this.uiContext = context;
            
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
            uiSystem.uiObjects.forEach(o=> o.parent || updateObject(o));
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
            uiSystem.uiObjects.forEach(o=> o.parent || renderObject(o));
        }
    }

    /** Draw a rectangle to the UI context
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color=uiSystem.defaultColor]
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
    drawRect(pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor)
    {
        uiSystem.uiContext.fillStyle = color.toString();
        uiSystem.uiContext.beginPath();
        uiSystem.uiContext.rect(pos.x-size.x/2, pos.y-size.y/2, size.x, size.y);
        uiSystem.uiContext.fill();
        if (lineWidth)
        {
            uiSystem.uiContext.strokeStyle = lineColor.toString();
            uiSystem.uiContext.lineWidth = lineWidth;
            uiSystem.uiContext.stroke();
        }
    }

    /** Draw a line to the UI context
    *  @param {Vector2} posA
    *  @param {Vector2} posB
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
    drawLine(posA, posB, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor)
    {
        uiSystem.uiContext.strokeStyle = lineColor.toString();
        uiSystem.uiContext.lineWidth = lineWidth;
        uiSystem.uiContext.beginPath();
        uiSystem.uiContext.lineTo(posA.x, posA.y);
        uiSystem.uiContext.lineTo(posB.x, posB.y);
        uiSystem.uiContext.stroke();
    }

    /** Draw a tile to the UI context
    *  @param {Vector2}  pos
    *  @param {Vector2}  size
    *  @param {TileInfo} tileInfo
    *  @param {Color}    [color=uiSystem.defaultColor]
    *  @param {number}   [angle]
    *  @param {boolean}  [mirror] */
    drawTile(pos, size, tileInfo, color=uiSystem.defaultColor, angle=0, mirror=false)
    {
        drawTile(pos, size, tileInfo, color, angle, mirror, BLACK, false, true, uiSystem.uiContext);
    }

    /** Draw text to the UI context
    *  @param {string}  text
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color=uiSystem.defaultColor]
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor]
    *  @param {string}  [align]
    *  @param {string}  [font=uiSystem.defaultFont] */
    drawText(text, pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor, align='center', font=uiSystem.defaultFont)
    {
        drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, size.x, uiSystem.uiContext);
    }
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
        this.color      = uiSystem.defaultColor;
        /** @property {Color} */
        this.lineColor  = uiSystem.defaultLineColor;
        /** @property {Color} */
        this.textColor  = uiSystem.defaultTextColor;
        /** @property {Color} */
        this.hoverColor = uiSystem.defaultHoverColor;
        /** @property {number} */
        this.lineWidth  = uiSystem.defaultLineWidth;
        /** @property {string} */
        this.font       = uiSystem.defaultFont;
        /** @property {number} - override for text height */
        this.textHeight   = undefined;
        /** @property {boolean} */
        this.visible    = true;
        /** @property {Array<UIObject>} */
        this.children   = [];
        /** @property {UIObject} */
        this.parent     = undefined;
        uiSystem.uiObjects.push(this);
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
            uiSystem.drawRect(this.pos, this.size, this.color, this.lineWidth, this.lineColor);
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
     *  @param {string}  [font=uiSystem.defaultFont]
     */
    constructor(pos, size, text='', align='center', font=uiSystem.defaultFont)
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
        const textSize = vec2(this.size.x, this.textHeight || this.size.y);
        uiSystem.drawText(this.text, this.pos, textSize, this.textColor, this.lineWidth, this.lineColor, this.align, this.font);
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
        uiSystem.drawTile(this.pos, this.size, this.tileInfo, this.color, this.angle, this.mirror);
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
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     */
    constructor(pos, size, text='', color=uiSystem.defaultButtonColor)
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
        uiSystem.drawRect(this.pos, this.size, color, this.lineWidth, lineColor);
        
        const textScale = .8; // scale text to fit in button
        const textSize = vec2(this.size.x, this.textHeight || this.size.y*textScale);
        uiSystem.drawText(this.text, this.pos, textSize, 
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
        uiSystem.drawRect(this.pos, this.size, color, this.lineWidth, this.lineColor);
        if (this.checked)
        {
            // draw an X if checked
            uiSystem.drawLine(this.pos.add(this.size.multiply(vec2(-.5,-.5))), this.pos.add(this.size.multiply(vec2(.5,.5))), this.lineWidth, this.lineColor);
            uiSystem.drawLine(this.pos.add(this.size.multiply(vec2(-.5,.5))), this.pos.add(this.size.multiply(vec2(.5,-.5))), this.lineWidth, this.lineColor);
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
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     *  @param {Color}   [handleColor=WHITE]
     */
    constructor(pos, size, value=.5, text='', color=uiSystem.defaultButtonColor, handleColor=WHITE)
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
        uiSystem.drawRect(this.pos, this.size, color, this.lineWidth, lineColor);
    
        const handleSize = vec2(this.size.y);
        const handleWidth = this.size.x - handleSize.x;
        const p1 = this.pos.x - handleWidth/2;
        const p2 = this.pos.x + handleWidth/2;
        const handlePos = vec2(lerp(this.value, p1, p2), this.pos.y);
        const barColor = this.mouseIsHeld ? this.color : this.handleColor;
        uiSystem.drawRect(handlePos, handleSize, barColor, this.lineWidth, this.lineColor);

        const textScale = .8; // scale text to fit in scrollbar
        const textSize = vec2(this.size.x, this.textHeight || this.size.y*textScale);
        uiSystem.drawText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font);
    }
}
