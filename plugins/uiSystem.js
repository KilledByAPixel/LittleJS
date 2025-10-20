/**
 * LittleJS User Interface Plugin
 * - call new UISystemPlugin() to setup the UI system
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 * @namespace UISystem
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global UI system plugin object
 *  @type {UISystemPlugin}
 *  @memberof UISystem */
let uiSystem;

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI System Global Object
 * @memberof UISystem
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
        this.defaultButtonColor = hsl(0,0,.7);
        /** @property {Color} - Default hover color for UI elements */
        this.defaultHoverColor = hsl(0,0,.9);
        /** @property {Color} - Default color for disabled UI elements */
        this.defaultDisabledColor = hsl(0,0,.3);
        /** @property {Color} - Uses a gradient fill combined with color */
        this.defaultGradientColor = undefined;
        /** @property {number} - Default line width for UI elements */
        this.defaultLineWidth = 4;
        /** @property {number} - Default rounded rect corner radius for UI elements */
        this.defaultCornerRadius = 0;
        /** @property {number} - Default scale to use for fitting text to object */
        this.defaultTextScale = .8;
        /** @property {string} - Default font for UI elements */
        this.defaultFont = fontDefault;
        /** @property {Sound} - Default sound when interactive UI element is pressed */
        this.defaultSoundPress = undefined;
        /** @property {Sound} - Default sound when interactive UI element is released */
        this.defaultSoundRelease = undefined;
        /** @property {Sound} - Default sound when interactive UI element is clicked */
        this.defaultSoundClick = undefined;
        /** @property {Array<UIObject>} - List of all UI elements */
        this.uiObjects = [];
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - Context to render UI elements to */
        this.uiContext = context;
        /** @property {UIObject} - Object user is currently interacting with */
        this.activeObject = undefined;
        /** @property {UIObject} - Top most object user is over */
        this.hoverObject = undefined;
        /** @property {UIObject} - Hover object at start of update */
        this.lastHoverObject = undefined;
        /** @property {number} - If set ui coords will be renormalized to this canvas height */
        this.nativeHeight = 0;

        engineAddPlugin(uiUpdate, uiRender);

        // setup recursive update and render
        // update in reverse order to detect mouse enter/leave
        function uiUpdate()
        {
            function updateInvisibleObject(o)
            {
                // update invisible objects
                for (const c of o.children)
                    updateInvisibleObject(c);
                o.updateInvisible();
            }
            function updateObject(o)
            {
                if (o.visible)
                {
                    // set position in parent space
                    if (o.parent)
                        o.pos = o.localPos.add(o.parent.pos);
                    // update in reverse order to detect mouse enter/leave
                    for (let i=o.children.length; i--;)
                        updateObject(o.children[i]);
                    o.update();
                }
                else
                    updateInvisibleObject(o);
            }
            // reset hover object at start of update
            uiSystem.lastHoverObject = uiSystem.hoverObject;
            uiSystem.hoverObject = undefined;
            for (let i = uiSystem.uiObjects.length; i--;)
            {
                const o = uiSystem.uiObjects[i];
                o.parent || updateObject(o)
            }
        }
        function uiRender()
        {
            const context = uiSystem.uiContext;
            context.save();
            if (uiSystem.nativeHeight)
            {
                // convert to native height
                const s = mainCanvasSize.y / uiSystem.nativeHeight;
                context.translate(-s*mainCanvasSize.x/2,0);
                context.scale(s,s);
                context.translate(mainCanvasSize.x/2/s,0);
            }

            function renderObject(o)
            {
                if (!o.visible)
                    return;
                if (o.parent)
                    o.pos = o.localPos.add(o.parent.pos);
                o.render();
                for (const c of o.children)
                    renderObject(c);
            }
            uiSystem.uiObjects.forEach(o=> o.parent || renderObject(o));
            context.restore();
        }
    }

    /** Draw a rectangle to the UI context
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color]
    *  @param {number}  [lineWidth]
    *  @param {Color}   [lineColor]
    *  @param {number}  [cornerRadius]
    *  @param {Color}   [gradientColor] */
    drawRect(pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, cornerRadius=0, gradientColor)
    {
        ASSERT(isVector2(pos), 'pos must be a vec2');
        ASSERT(isVector2(size), 'size must be a vec2');
        ASSERT(isColor(color), 'color must be a color');
        ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
        ASSERT(isColor(lineColor), 'lineColor must be a color');
        ASSERT(isNumber(cornerRadius), 'cornerRadius must be a number');
        
        const context = uiSystem.uiContext;
        if (gradientColor)
        {
            const g = context.createLinearGradient(
                pos.x, pos.y-size.y/2, pos.x, pos.y+size.y/2);
            const c = color.toString();
            g.addColorStop(0, c);
            g.addColorStop(.5, gradientColor.toString());
            g.addColorStop(1, c);
            context.fillStyle = g;
        }
        else
            context.fillStyle = color.toString();
        context.beginPath();
        if (cornerRadius && context['roundRect'])
            context['roundRect'](pos.x-size.x/2, pos.y-size.y/2, size.x, size.y, cornerRadius);
        else
            context.rect(pos.x-size.x/2, pos.y-size.y/2, size.x, size.y);
        context.fill();
        if (lineWidth)
        {
            context.strokeStyle = lineColor.toString();
            context.lineWidth = lineWidth;
            context.stroke();
        }
    }

    /** Draw a line to the UI context
    *  @param {Vector2} posA
    *  @param {Vector2} posB
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor] */
    drawLine(posA, posB, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor)
    {
        ASSERT(isVector2(posA), 'posA must be a vec2');
        ASSERT(isVector2(posB), 'posB must be a vec2');
        ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
        ASSERT(isColor(lineColor), 'lineColor must be a color');

        const context = uiSystem.uiContext;
        context.strokeStyle = lineColor.toString();
        context.lineWidth = lineWidth;
        context.beginPath();
        context.lineTo(posA.x, posA.y);
        context.lineTo(posB.x, posB.y);
        context.stroke();
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
        drawTile(pos, size, tileInfo, color, angle, mirror, CLEAR_BLACK, false, true, uiSystem.uiContext);
    }

    /** Draw text to the UI context
    *  @param {string}  text
    *  @param {Vector2} pos
    *  @param {Vector2} size
    *  @param {Color}   [color=uiSystem.defaultColor]
    *  @param {number}  [lineWidth=uiSystem.defaultLineWidth]
    *  @param {Color}   [lineColor=uiSystem.defaultLineColor]
    *  @param {string}  [align]
    *  @param {string}  [font=uiSystem.defaultFont]
    *  @param {string}  [fontStyle]
    *  @param {boolean} [applyMaxWidth=true]
    *  @param {Vector2} [textShadow]
     */
    drawText(text, pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor, align='center', font=uiSystem.defaultFont, fontStyle='', applyMaxWidth=true, textShadow=undefined)
    {
        if (textShadow)
            drawTextScreen(text, pos.add(textShadow), size.y, BLACK, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, uiSystem.uiContext);
        drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, uiSystem.uiContext);
    }

    /**
     * @callback DragAndDropCallback - Callback for drag and drop events
     * @param {DragEvent} event - The drag event
     * @memberof UISystem
     */

    /** Setup drag and drop event handlers
    *  Automatically prevents defaults and calls the given functions
    *  @param {DragAndDropCallback} [onDrop] - when a file is dropped
    *  @param {DragAndDropCallback} [onDragEnter] - when a file is dragged onto the window
    *  @param {DragAndDropCallback} [onDragLeave] - when a file is dragged off the window
    *  @param {DragAndDropCallback} [onDragOver] - continously when dragging over */
    setupDragAndDrop(onDrop, onDragEnter, onDragLeave, onDragOver)
    {
        function setCallback(callback, listenerType)
        {
            function listener(e) { e.preventDefault(); callback && callback(e); }
            document.addEventListener(listenerType, listener);
        }
        setCallback(onDrop,      'drop');
        setCallback(onDragEnter, 'dragenter');
        setCallback(onDragLeave, 'dragleave');
        setCallback(onDragOver,  'dragover');
    }

    /** Convert a screen space position to native UI position
     *  @param {Vector2} pos
     *  @return {Vector2}
     */
    screenToNative(pos)
    {
        if (!uiSystem.nativeHeight)
            return pos;
    
        const s = mainCanvasSize.y / uiSystem.nativeHeight;
        const sInv = 1/s;
        const p = pos.copy();
        p.x += s*mainCanvasSize.x/2;
        p.x *= sInv;
        p.y *= sInv;
        p.x -= sInv*mainCanvasSize.x/2;
        return p;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UI Object - Base level object for all UI elements
 * @memberof UISystem */
class UIObject
{
    /** Create a UIObject
     *  @param {Vector2}  [pos=(0,0)]
     *  @param {Vector2}  [size=(1,1)]
     */
    constructor(pos=vec2(), size=vec2())
    {
        ASSERT(isVector2(pos), 'ui object pos must be a vec2');
        ASSERT(isVector2(size), 'ui object size must be a vec2');

        /** @property {Vector2} - Local position of the object */
        this.localPos = pos.copy();
        /** @property {Vector2} - Screen space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - Screen space size of the object */
        this.size = size.copy();
        /** @property {Color} - Color of the object */
        this.color = uiSystem.defaultColor.copy();
        /** @property {Color} - Color of the object when active, uses color if undefined */
        this.activeColor = undefined;
        /** @property {string} - Text for this ui object */
        this.text = undefined;
        /** @property {Color} - Color when disabled */
        this.disabledColor = uiSystem.defaultDisabledColor.copy();
        /** @property {boolean} - Is this object disabled? */
        this.disabled = false;
        /** @property {Color} - Color for text */
        this.textColor = uiSystem.defaultTextColor.copy();
        /** @property {Color} - Color used when hovering over the object */
        this.hoverColor = uiSystem.defaultHoverColor.copy();
        /** @property {Color} - Color for line drawing */
        this.lineColor = uiSystem.defaultLineColor.copy();
        /** @property {Color} - Uses a gradient fill combined with color */
        this.gradientColor = uiSystem.defaultGradientColor ? uiSystem.defaultGradientColor.copy() : undefined;
        /** @property {number} - Width for line drawing */
        this.lineWidth = uiSystem.defaultLineWidth;
        /** @property {number} - Corner radius for rounded rects */
        this.cornerRadius = uiSystem.defaultCornerRadius;
        /** @property {string} - Font for this objecct */
        this.font = uiSystem.defaultFont;
        /** @property {string} - Font style for this object or undefined */
        this.fontStyle = undefined;
        /** @property {number} - Override for text width */
        this.textWidth = undefined;
        /** @property {number} - Override for text height */
        this.textHeight = undefined;
        /** @property {number} - Scale text to fit in the object */
        this.textScale = uiSystem.defaultTextScale;
        /** @property {boolean} - Should this object be drawn */
        this.visible  = true;
        /** @property {Array<UIObject>} - A list of this object's children */
        this.children = [];
        /** @property {UIObject} - This object's parent, position is in parent space */
        this.parent = undefined;
        /** @property {number} - Added size to make small buttons easier to touch on mobile devices */
        this.extraTouchSize = 0;
        /** @property {Sound} - Sound when interactive element is pressed */
        this.soundPress = uiSystem.defaultSoundPress;
        /** @property {Sound} - Sound when interactive element is released */
        this.soundRelease = uiSystem.defaultSoundRelease;
        /** @property {Sound} - Sound when interactive element is clicked */
        this.soundClick = uiSystem.defaultSoundClick;
        /** @property {boolean} - Is this element interactive */
        this.interactive = false;
        /** @property {boolean} - Activate when dragged over with mouse held down */
        this.dragActivate = false;
        /** @property {boolean} - True if this can be a hover object */
        this.canBeHover = true;
        uiSystem.uiObjects.push(this);
        
        /** @property {Vector2} - How much to offset the text shadow or undefined */
        this.textShadow = undefined;
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
        ASSERT(child.parent === this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = undefined;
    }

    /** Check if the mouse is overlapping a box in screen space
     *  @return {boolean} - True if overlapping
     */
    isMouseOverlapping()
    {
        if (!mouseInWindow) return false;

        const size = !isTouchDevice ? this.size :
                this.size.add(vec2(this.extraTouchSize || 0));
        const pos = uiSystem.screenToNative(mousePosScreen);
        return isOverlapping(this.pos, size, pos);
    }

    /** Update the object, called automatically by plugin once each frame */
    update()
    {
        // call the custom update callback
        this.onUpdate();

        const wasHover = uiSystem.lastHoverObject === this;
        const isActive = this.isActiveObject();
        const mouseDown = mouseIsDown(0);
        const mousePress = this.dragActivate ? mouseDown : mouseWasPressed(0);
        if (this.canBeHover)
        if (mousePress || isActive || (!mouseDown && !isTouchDevice))
        if (!uiSystem.hoverObject && this.isMouseOverlapping())
            uiSystem.hoverObject = this;
        if (this.isHoverObject())
        {
            if (!this.disabled)
            {
                if (mousePress)
                {
                    if (this.interactive)
                    {
                        if (!this.dragActivate || (!wasHover || mouseWasPressed(0)))
                            this.onPress();
                        if (this.soundPress)
                            this.soundPress.play();
                        if (uiSystem.activeObject && !isActive)
                            uiSystem.activeObject.onRelease();
                        uiSystem.activeObject = this;
                    }
                }
                if (!mouseDown && this.isActiveObject() && this.interactive)
                {
                    this.onClick();
                    if (this.soundClick)
                        this.soundClick.play();
                }
            }
            // clear mouse was pressed state even when disabled
            mousePress && inputClearKey(0,0,0,1,0);
        }
        if (isActive)
        if (!mouseDown || (this.dragActivate && !this.isHoverObject()))
        {
            this.onRelease();
            if (this.soundRelease)
                this.soundRelease.play();
            uiSystem.activeObject = undefined;
        }

        // call enter/leave events
        if (this.isHoverObject() !== wasHover)
            this.isHoverObject() ? this.onEnter() : this.onLeave();
    }

    /** Render the object, called automatically by plugin once each frame */
    render()
    {
        if (!this.size.x || !this.size.y) return;

        const lineColor = this.interactive && this.isActiveObject() && !this.disabled ? this.color : this.lineColor;
        const color = this.disabled ? this.disabledColor : this.interactive ? this.isActiveObject() ? this.activeColor || this.color : this.isHoverObject() ? this.hoverColor : this.color : this.color;
        uiSystem.drawRect(this.pos, this.size, color, this.lineWidth, lineColor, this.cornerRadius, this.gradientColor);
    }

    /** Special update when object is not visible */
    updateInvisible()
    {
        // reset input state when not visible
        if (this.isActiveObject())
            uiSystem.activeObject = undefined;
    }

    /** Get the size for text with overrides and scale
     *  @return {Vector2}
     */
    getTextSize()
    {
        return vec2(
            this.textWidth  || this.textScale * this.size.x, 
            this.textHeight || this.textScale * this.size.y);
    }

    /** @return {boolean} - Is the mouse hovering over this element */
    isHoverObject() { return uiSystem.hoverObject === this; }

    /** @return {boolean} - Is the mouse held onto this element */
    isActiveObject() { return uiSystem.activeObject === this; }

    /** Called each frame when object updates */
    onUpdate() {}

    /** Called when the mouse enters the object */
    onEnter() {}

    /** Called when the mouse leaves the object */
    onLeave() {}

    /** Called when the mouse is pressed while over the object */
    onPress() {}

    /** Called when the mouse is released while over the object */
    onRelease() {}

    /** Called when user clicks on this object */
    onClick() {}

    /** Called when the state of this object changes */
    onChange() {}
};

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIText - A UI object that displays text
 * @extends UIObject
 * @memberof UISystem
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

        ASSERT(isString(text), 'ui text must be a string');
        ASSERT(['left','center','right'].includes(align), 'ui text align must be left, center, or right');
        ASSERT(isString(font), 'ui text font must be a string');

        // set properties
        this.text = text;
        this.align = align;
        this.font = font;

        // make text not outlined by default
        this.lineWidth = 0;
        // text can not be a hover object by default
        this.canBeHover = false;
    }
    render()
    {
        // only render the text
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, this.textColor, this.lineWidth, this.lineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UITile - A UI object that displays a tile image
 * @extends UIObject
 * @memberof UISystem
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

        ASSERT(tileInfo instanceof TileInfo, 'ui tile tileInfo must be a TileInfo');
        ASSERT(isColor(color), 'ui tile color must be a color');
        ASSERT(isNumber(angle), 'ui tile angle must be a number');

        /** @property {TileInfo} - Tile image to use */
        this.tileInfo = tileInfo;
        /** @property {number} - Angle to rotate in radians */
        this.angle = angle;
        /** @property {boolean} - Should it be mirrored? */
        this.mirror = mirror;
        // set properties
        this.color = color.copy();
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
 * @memberof UISystem
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

        ASSERT(isString(text), 'ui button must be a string');
        ASSERT(isColor(color), 'ui button color must be a color');

        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    render()
    {
        super.render();
        
        // draw the text scaled to fit
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UICheckbox - A UI object that acts as a checkbox
 * @extends UIObject
 * @memberof UISystem
 */
class UICheckbox extends UIObject
{
    /** Create a UICheckbox object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {boolean} [checked]
     *  @param {string}  [text]
     *  @param {Color}   [color=uiSystem.defaultButtonColor]
     */
    constructor(pos, size, checked=false, text='', color=uiSystem.defaultButtonColor)
    {
        super(pos, size);

        ASSERT(isString(text), 'ui checkbox must be a string');
        ASSERT(isColor(color), 'ui checkbox color must be a color');

        /** @property {boolean} - Current percentage value of this scrollbar 0-1 */
        this.checked = checked;
        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    onClick()
    {
        this.checked = !this.checked;
        this.onChange();
    }
    render()
    {
        super.render();
        if (this.checked)
        {
            const p = this.cornerRadius / min(this.size.x, this.size.y) * 2;
            const length = lerp(1, 2**.5/2, p) / 2;
            let s = this.size.scale(length);
            uiSystem.drawLine(this.pos.add(s.multiply(vec2(-1))), this.pos.add(s.multiply(vec2(1))), this.lineWidth, this.lineColor);
            uiSystem.drawLine(this.pos.add(s.multiply(vec2(-1,1))), this.pos.add(s.multiply(vec2(1,-1))), this.lineWidth, this.lineColor);
        }
        
        // draw the text next to the checkbox
        const textSize = this.getTextSize();
        const pos = this.pos.add(vec2(this.size.x,0));
        uiSystem.drawText(this.text, pos, textSize, 
            this.textColor, 0, undefined, 'left', this.font, this.fontStyle, false, this.textShadow);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * UIScrollbar - A UI object that acts as a scrollbar
 * @extends UIObject
 * @memberof UISystem
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

        ASSERT(isNumber(value), 'ui scrollbar value must be a number');
        ASSERT(isString(text), 'ui scrollbar must be a string');
        ASSERT(isColor(color), 'ui scrollbar color must be a color');
        ASSERT(isColor(handleColor), 'ui scrollbar handleColor must be a color');

        /** @property {number} - Current percentage value of this scrollbar 0-1 */
        this.value = value;
        /** @property {Color} - Color for the handle part of the scrollbar */
        this.handleColor = handleColor.copy();

        // set properties
        this.text = text;
        this.color = color.copy();
        this.interactive = true;
    }
    update()
    {
        super.update();
        if (this.isActiveObject() && this.interactive)
        {
            // handle horizontal or vertical scrollbar
            const isHorizontal = this.size.x > this.size.y;
            const handleSize = isHorizontal ? this.size.y : this.size.x;
            const barSize = isHorizontal ? this.size.x : this.size.y;
            const centerPos = isHorizontal ? this.pos.x : this.pos.y;

            // check if value changed
            const handleWidth = barSize - handleSize;
            const p1 = centerPos - handleWidth/2;
            const p2 = centerPos + handleWidth/2;
            const oldValue = this.value;

            const p = uiSystem.screenToNative(mousePosScreen);
            this.value = isHorizontal ? 
                percent(p.x, p1, p2) :
                percent(p.y, p2, p1);
            this.value === oldValue || this.onChange();
        }
    }
    render()
    {
        super.render();

        // handle horizontal or vertical scrollbar
        const isHorizontal = this.size.x > this.size.y;
        const handleSize = isHorizontal ? this.size.y : this.size.x;
        const barSize = isHorizontal ? this.size.x : this.size.y;
        const centerPos = isHorizontal ? this.pos.x : this.pos.y;
        
        // draw the scrollbar handle
        const handleWidth = barSize - handleSize;
        const p1 = centerPos - handleWidth/2;
        const p2 = centerPos + handleWidth/2;
        const handlePos = isHorizontal ? 
            vec2(lerp(p1, p2, this.value), this.pos.y) :
            vec2(this.pos.x, lerp(p2, p1, this.value))
        const handleColor = this.disabled ? this.disabledColor : this.handleColor;
        uiSystem.drawRect(handlePos, vec2(handleSize), handleColor, this.lineWidth, this.lineColor, this.cornerRadius, this.gradientColor);

        // draw the text scaled to fit on the scrollbar
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, 
            this.textColor, 0, undefined, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
}