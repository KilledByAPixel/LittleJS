/**
 * LittleJS User Interface Plugin
 * - call new UISystemPlugin() to setup the UI system
 * - Gamepad and keyboard navigation support
 * - Nested Menus
 * - Text
 * - Buttons
 * - Checkboxes
 * - Images
 * - Scrollbars
 * - Video
 * @namespace UISystem
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global UI system plugin object
 *  @type {UISystemPlugin}
 *  @memberof UISystem */
let uiSystem;

/** Enable UI system debug drawing
 *  0=off, 1=normal, 2=show invisible
 *  @type {number}
 *  @default
 *  @memberof UISystem */
let uiDebug = 0;

/** Enable UI system debug drawing
 *  0=off, 1=normal, 2=show invisible
 *  @param {number|boolean} enable
 *  @memberof UISystem */
function uiSetDebug(debugMode)
{ uiDebug = typeof debugMode === 'boolean' ? (debugMode ? 1 : 0) : debugMode; }

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

        // default settings
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
        this.defaultTextFitScale = .8;
        /** @property {string} - Default font for UI elements */
        this.defaultFont = fontDefault;
        /** @property {Sound} - Default sound when interactive UI element is pressed */
        this.defaultSoundPress = undefined;
        /** @property {Sound} - Default sound when interactive UI element is released */
        this.defaultSoundRelease = undefined;
        /** @property {Sound} - Default sound when interactive UI element is clicked */
        this.defaultSoundClick = undefined;
        /** @property {Color} - Color for shadow */
        this.defaultShadowColor = CLEAR_BLACK;
        /** @property {number} - Size of shadow blur */
        this.defaultShadowBlur = 5;
        /** @property {Vector2} - Offset of shadow blur */
        this.defaultShadowOffset = vec2(5);
        /** @property {number} - If set ui coords will be renormalized to this canvas height */
        this.nativeHeight = 0;

        // navigation properties
        /** @property {UIObject} - Object currently selected by navigation (gamepad or keyboard) */
        this.navigationObject = undefined;
        /** @property {Timer} - Cooldown timer for navigation inputs */
        this.navigationTimer = new Timer(undefined, true);
        /** @property {number} - Time between navigation inputs in seconds */
        this.navigationDelay = .2;
        /** @property {boolean} - should the navigation be horizontal, vertical, or both? */
        this.navigationDirection = 1;
        /** @property {boolean} - True if user last used navigation instead of mouse */
        this.navigationMode = false;

        // system state
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
        /** @property {UIObject} - Current confirm menu being shown */
        this.confirmDialog = undefined;

        engineAddPlugin(uiUpdate, uiRender);

        // set object position in parent space
        function updateTransforms(o)
        {
            if (!o.parent) return;
            o.pos.x = o.localPos.x + o.parent.pos.x;
            o.pos.y = o.localPos.y + o.parent.pos.y;
        }

        // setup recursive update and render
        // update in reverse order to detect mouse enter/leave
        function uiUpdate()
        {
            if (uiSystem.activeObject && !uiSystem.activeObject.visible)
                uiSystem.activeObject = undefined;

            // reset hover object at start of update
            uiSystem.lastHoverObject = uiSystem.hoverObject;
            uiSystem.hoverObject = undefined;

            if (mouseWasPressed(0))
            {
                uiSystem.navigationMode = false;
                uiSystem.navigationObject = undefined;
            }

            // navigation with gamepad/keyboard
            const navigableObjects = uiSystem.getNavigableObjects();
            if (!navigableObjects.length)
                uiSystem.navigationObject = undefined;
            else
            {
                // unselect object if it is no longer navigable
                if (!navigableObjects.includes(uiSystem.navigationObject))
                    uiSystem.navigationObject = undefined;

                if (!isTouchDevice)
                if (uiSystem.navigationMode && !uiSystem.navigationObject)
                {
                    // select first auto focus object
                    uiSystem.navigationObject = navigableObjects.find(o=>o.navigationAutoSelect);
                }
                
                // navigate with dpad or left stick
                if (!uiSystem.navigationTimer.active())
                {
                    // navigate through list with gamepad or keyboard
                    const direction = sign(uiSystem.getNavigationDirection());
                    if (direction)
                    {
                        let newNavigationObject;
                        if (!uiSystem.navigationObject)
                        {
                            // use auto select object
                            newNavigationObject = navigableObjects.find(o=>o.navigationAutoSelect);

                            if (!newNavigationObject)
                            {
                                // try first or last object
                                const newIndex = direction > 0 ? 0 : navigableObjects.length-1;
                                newNavigationObject = navigableObjects[newIndex];
                            }
                        }
                        else
                        {
                            const currentIndex = navigableObjects.indexOf(uiSystem.navigationObject);
                            const newIndex = mod(currentIndex + direction, navigableObjects.length);
                            newNavigationObject = navigableObjects[newIndex];
                        }
                        
                        if (uiSystem.navigationObject !== newNavigationObject)
                        {
                            uiSystem.navigationMode = true;
                            uiSystem.hoverObject = undefined;
                            uiSystem.navigationObject = newNavigationObject;
                            uiSystem.navigationTimer.set(uiSystem.navigationDelay);
                            newNavigationObject.soundPress &&
                                newNavigationObject.soundPress.play();
                        }
                    }
                }

                // activate the navigation object when pressed
                if (uiSystem.navigationObject)
                if (uiSystem.getNavigationWasPressed())
                    uiSystem.navigationObject.navigatePressed();
            }

            // update in reverse order so topmost objects get priority
            for (let i = uiSystem.uiObjects.length; i--;)
            {
                const o = uiSystem.uiObjects[i];
                o.parent || updateObject(o);
            }

            // remove destroyed objects
            uiSystem.uiObjects = uiSystem.uiObjects.filter(o=>!o.destroyed);

            function updateObject(o)
            {
                if (!o.visible) return;

                // update in reverse order to detect mouse enter/leave
                updateTransforms(o);
                for (let i=o.children.length; i--;)
                    updateObject(o.children[i]);
                o.update();
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
                if (!o.visible) return;

                // render object and children
                updateTransforms(o);
                o.render();
                for (const c of o.children)
                    renderObject(c);
            }
            uiSystem.uiObjects.forEach(o=> o.parent || renderObject(o));

            if (uiDebug > 0)
            {
                // debug render all objects
                function renderDebug(o, visible=true)
                {
                    visible &&= !!o.visible;
                    updateTransforms(o);
                    o.renderDebug(visible);
                    for (const c of o.children)
                        renderDebug(c, visible);
                }
                uiSystem.uiObjects.forEach(o=> o.parent || renderDebug(o));
            }
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
    *  @param {Color}   [gradientColor]
    *  @param {Color}   [shadowColor]
    *  @param {number}  [shadowBlur]
    *  @param {Color}   [shadowOffset] */
    drawRect(pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, cornerRadius=0, gradientColor, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
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
        if (shadowBlur || shadowOffset.x || shadowOffset.y)
        if (shadowColor.a > 0)
        {
            // setup shadow
            context.shadowColor = shadowColor.toString();
            context.shadowBlur = shadowBlur;
            context.shadowOffsetX = shadowOffset.x;
            context.shadowOffsetY = shadowOffset.y;
        }
        context.beginPath();
        if (cornerRadius && context['roundRect'])
            context['roundRect'](pos.x-size.x/2, pos.y-size.y/2, size.x, size.y, cornerRadius);
        else
            context.rect(pos.x-size.x/2, pos.y-size.y/2, size.x, size.y);
        context.fill();
        context.shadowColor = '#0000';
        if (lineWidth && lineColor.a > 0)
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
    *  @param {boolean}  [mirror]
    *  @param {Color}    [shadowColor]
    *  @param {number}   [shadowBlur]
    *  @param {Color}    [shadowOffset] */
    drawTile(pos, size, tileInfo, color=uiSystem.defaultColor, angle=0, mirror=false, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
    {
        const context = uiSystem.uiContext;
        if (shadowBlur || shadowOffset.x || shadowOffset.y)
        if (shadowColor.a > 0)
        {
            // setup shadow
            context.shadowColor = shadowColor.toString();
            context.shadowBlur = shadowBlur;
            context.shadowOffsetX = shadowOffset.x;
            context.shadowOffsetY = shadowOffset.y;
        }
        drawTile(pos, size, tileInfo, color, angle, mirror, CLEAR_BLACK, false, true, context);
        context.shadowColor = '#0000';
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
    *  @param {Color}   [shadowColor]
    *  @param {number}  [shadowBlur]
    *  @param {Color}   [shadowOffset] */
    drawText(text, pos, size, color=uiSystem.defaultColor, lineWidth=uiSystem.defaultLineWidth, lineColor=uiSystem.defaultLineColor, align='center', font=uiSystem.defaultFont, fontStyle='', applyMaxWidth=true, textShadow=undefined, shadowColor=BLACK, shadowBlur=0, shadowOffset=vec2())
    {
        const context = uiSystem.uiContext;
        if (shadowColor.a > 0)
        {
            if (textShadow)
                drawTextScreen(text, pos.add(textShadow), size.y, shadowColor, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, context);
            if (shadowBlur || shadowOffset.x || shadowOffset.y)
            {
                // setup shadow
                context.shadowColor = shadowColor.toString();
                context.shadowBlur = shadowBlur;
                context.shadowOffsetX = shadowOffset.x;
                context.shadowOffsetY = shadowOffset.y;
            }
        }
        drawTextScreen(text, pos, size.y, color, lineWidth, lineColor, align, font, fontStyle, applyMaxWidth ? size.x : undefined, 0, context);
        context.shadowColor = '#0000';
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
    *  @param {DragAndDropCallback} [onDragOver] - continuously when dragging over */
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
     *  @return {Vector2} */
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

    /** Destroy and remove all objects
    *  @memberof Engine */
    destroyObjects()
    {
        for (const o of this.uiObjects)
            o.parent || o.destroy();
        this.uiObjects = this.uiObjects.filter(o=>!o.destroyed);
        this.activeObject = undefined;
        this.hoverObject = undefined;
        this.lastHoverObject = undefined;
    }

    /** Get all navigable UI objects sorted by navigationIndex
     *  @return {Array<UIObject>} */
    getNavigableObjects()
    {
        function getNavigableRecursive(o)
        {
            if (!o.visible || o.disabled)
                return; // skip children if parent is invisible or disabled

            if (o.isInteractive() && o.navigationIndex !== undefined)
                objects.push(o);
            for (let i=o.children.length; i--;)
                getNavigableRecursive(o.children[i]);
        }

        // get all the valid navigable objects recursively
        let objects = [];
        for (let i = uiSystem.uiObjects.length; i--;)
        {
            const o = uiSystem.uiObjects[i];
            if (uiSystem.confirmDialog && o !== uiSystem.confirmDialog)
                continue;
            o.parent || getNavigableRecursive(o);
        }

        // sort by navigationIndex (lower numbers first)
        objects.sort((a, b)=> a.navigationIndex - b.navigationIndex);
        return objects;
    }

    /** Get navigation direction from gamepad or keyboard
     *  @return {number} */
    getNavigationDirection()
    {
        const vertical = uiSystem.navigationDirection === 1;
        const both = uiSystem.navigationDirection === 2;
        if (isUsingGamepad)
        {
            const stick = gamepadStick(0, gamepadPrimary);
            const dpad = gamepadDpad(gamepadPrimary);
            if (both)
                return -(stick.y || dpad.y) || (stick.x || dpad.x);
            return vertical ? -(stick.y || dpad.y) : (stick.x || dpad.x);
        }
        const up = 'ArrowUp', down = 'ArrowDown', left = 'ArrowLeft', right = 'ArrowRight';
        if (both)
        {
            return keyIsDown(up) || keyIsDown(left) ? -1 : 
                keyIsDown(down) || keyIsDown(right) ? 1 : 0;
        }
        const back = vertical ? up : left;
        const forward = vertical ? down : right;
        return keyIsDown(back) ? -1 : keyIsDown(forward) ? 1 : 0;
    }

    /** Get other axis navigation direction from gamepad or keyboard
     *  @return {Vector2} */
    getNavigationOtherDirection()
    {
        if (uiSystem.navigationDirection === 2)
            return 0; // other direction disabled

        const vertical = uiSystem.navigationDirection === 1;
        if (isUsingGamepad)
        {
            const stick = gamepadStick(0, gamepadPrimary);
            const dpad = gamepadDpad(gamepadPrimary);
            return !vertical ? (stick.y || dpad.y) : (stick.x || dpad.x);
        }
        const back = !vertical ? 'ArrowUp' : 'ArrowLeft';
        const forward = !vertical ? 'ArrowDown' : 'ArrowRight';
        return keyIsDown(back) ? -1 : keyIsDown(forward) ? 1 : 0;
    }

    /** Get if navigation button was pressed from gamepad or keyboard
     *  @return {boolean} */
    getNavigationWasPressed()
    {
        return isUsingGamepad ? gamepadWasPressed(0, gamepadPrimary) : 
            keyWasPressed('Space') || keyWasPressed('Enter');
    }
        
    /** Show a confirmation dialog with Yes/No buttons
     *  Centers the dialog on the screen with darkened background
     *  @param {string} [text] - The message to display
     *  @param {Function} [yesCallback] - Called when Yes is clicked
     *  @param {Function} [noCallback] - Called when No is clicked
     *  @param {Vector2} [size] - Size of the confirmation dialog
     *  @param {string} [exitKey] - Key that can exit the menu
     *  @return {UIObject} The confirmation menu object
     */
    showConfirmDialog(text='Are you sure?', yesCallback, noCallback, size=vec2(500,250), exitKey='Escape')
    {
        ASSERT(!uiSystem.confirmDialog);

        const savedNavigationDirection = uiSystem.navigationDirection;

        // allow both axies for navigation
        uiSystem.navigationDirection = 2;

        // confirm menu
        const confirmMenu = new UIObject(vec2(), size);
        uiSystem.confirmDialog = confirmMenu;
        confirmMenu.onRender = ()=> 
        {
            confirmMenu.pos = uiSystem.screenToNative(mainCanvasSize.scale(.5));
            const backgroundColor = hsl(0,0,0,.7);
            uiSystem.drawRect(vec2(), vec2(1e9), backgroundColor);
        }
        confirmMenu.onUpdate = ()=>
        {
            if (keyWasPressed(exitKey))
                closeMenu();
        }
        confirmMenu.isMouseOverlapping = ()=> true; // always hover
        
        // title text
        const gap = 50;
        const textTitle = new UIText(vec2(0,-50), vec2(size.x-gap,70), text);
        confirmMenu.addChild(textTitle);
        
        // yes button
        const buttonYes = new UIButton(vec2(-80,50), vec2(120,70), 'Yes');
        buttonYes.textHeight = 40;
        buttonYes.navigationIndex = 1;
        buttonYes.hoverColor = hsl(0,1,.5);
        buttonYes.onClick = ()=> { closeMenu(); yesCallback && yesCallback(); }; 
        confirmMenu.addChild(buttonYes);
        
        // no button
        const buttonNo = new UIButton(vec2(80,50), vec2(120,70), 'No');
        buttonNo.textHeight = 40;
        buttonNo.navigationIndex = 2;
        buttonNo.navigationAutoSelect = true;
        buttonNo.onClick = ()=> { closeMenu(); noCallback && noCallback(); };
        confirmMenu.addChild(buttonNo);

        // close menu and return to normal navigation
        function closeMenu()
        {
            ASSERT(uiSystem.confirmDialog === confirmMenu);
            confirmMenu.destroy();
            uiSystem.confirmDialog = undefined;
            uiSystem.navigationDirection = savedNavigationDirection;
            inputClear();
        }
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
        this.textFitScale = uiSystem.defaultTextFitScale;
        /** @property {Vector2} - How much to offset the text shadow or undefined */
        this.textShadow = undefined;
        /** @property {number} - Color for text line drawing  */
        this.textLineColor = uiSystem.defaultLineColor.copy();
        /** @property {number} - Width for text line drawing */
        this.textLineWidth = 0;
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
        /** @property {Color} - Color for shadow, undefined if no shadow */
        this.shadowColor = uiSystem.defaultShadowColor?.copy();
        /** @property {number} - Size of shadow blur */
        this.shadowBlur = uiSystem.defaultShadowBlur;
        /** @property {Vector2} - Offset of shadow blur */
        this.shadowOffset = uiSystem.defaultShadowOffset?.copy();
        /** @property {number} - Optional navigation order index, lower values are selected first */
        this.navigationIndex = undefined;
        /** @property {boolean} - Should this be auto selected by navigation? Must also have valid navigation index. */
        this.navigationAutoSelect = false;
        
        uiSystem.uiObjects.push(this);
    }

    /** Add a child UIObject to this object
     *  @param {UIObject} child */
    addChild(child)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
    }

    /** Remove a child UIObject from this object
     *  @param {UIObject} child */
    removeChild(child)
    {
        ASSERT(child.parent === this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = undefined;
    }

    /** Destroy this object, destroy its children, detach its parent, and mark it for removal */
    destroy()
    {
        if (this.destroyed)
            return;

        // disconnect from parent and destroy children
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
        {
            child.parent = 0;
            child.destroy();
        }
    }

    /** Check if the mouse is overlapping a box in screen space
     *  @return {boolean} - True if overlapping */
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

        // unset active if disabled
        if (this.disabled && this == uiSystem.activeObject)
            uiSystem.activeObject = undefined;

        const wasHover = uiSystem.lastHoverObject === this;
        const isActive = this.isActiveObject();
        const mouseDown = mouseIsDown(0);
        const mousePress = this.dragActivate ? mouseDown : mouseWasPressed(0);
        if (this.canBeHover)
        if (!uiSystem.navigationMode) // no mouse hover in navigation mode
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
                        this.soundPress && this.soundPress.play();
                        if (uiSystem.activeObject && !isActive)
                            uiSystem.activeObject.onRelease();
                        uiSystem.activeObject = this;
                    }
                }
                if (!mouseDown && this.isActiveObject() && this.interactive)
                {
                    this.onClick();
                    this.soundClick && this.soundClick.play();
                }
            }

            // clear mouse was pressed state even when disabled
            mousePress && inputClearKey(0,0,0,1,0);
        }
        if (isActive)
        if (!mouseDown || (this.dragActivate && !this.isHoverObject()))
        {
            this.onRelease();
            this.soundRelease && this.soundRelease.play();
            uiSystem.activeObject = undefined;
        }

        // call enter/leave events
        if (this.isHoverObject() !== wasHover)
            this.isHoverObject() ? this.onEnter() : this.onLeave();
    }

    /** Render the object, called automatically by plugin once each frame */
    render()
    {
        // call the custom render callback
        this.onRender();

        if (!this.size.x || !this.size.y) return;

        const isNavigationObject = this.isNavigationObject();
        const lineColor = isNavigationObject ? this.color :
            this.interactive && this.isActiveObject() && !this.disabled ?
            this.color : this.lineColor;
        const color = isNavigationObject ? this.hoverColor :
            this.disabled ? this.disabledColor : 
            this.interactive ? 
                this.isHoverObject() ? this.hoverColor : 
                this.isActiveObject() ? this.activeColor || this.color : 
                this.color : this.color;
        const lineWidth = this.lineWidth * (isNavigationObject ? 1.5 : 1);
        
        uiSystem.drawRect(this.pos, this.size, color, lineWidth, lineColor, this.cornerRadius, this.gradientColor, this.shadowColor, this.shadowBlur, this.shadowOffset);
    }

    /** Get the size for text with overrides and scale
     *  @return {Vector2} */
    getTextSize()
    {
        return vec2(
            this.textWidth  || this.textFitScale * this.size.x, 
            this.textHeight || this.textFitScale * this.size.y);
    }

    /** Called when the navigation button is pressed on this object */
    navigatePressed()
    {
        this.onClick();
        this.soundClick && this.soundClick.play();
    }

    /** @return {boolean} - Is the mouse hovering over this element */
    isHoverObject() { return uiSystem.hoverObject === this; }

    /** @return {boolean} - Is the mouse held onto this element */
    isActiveObject() { return uiSystem.activeObject === this; }

    /** @return {boolean} - Is the gamepad or keyboard navigation object */
    isNavigationObject() { return uiSystem.navigationObject === this; }

    /** @return {boolean} - Can it be interacted with */
    isInteractive() { return this.interactive && this.visible && !this.disabled;}

    /** Returns string containing info about this object for debugging
     *  @return {string} */
    toString()
    {
        if (!debug) return;
        
        let text = 'type = ' + this.constructor.name;
        if (this.text)
            text += '\ntext = ' + this.text;
        if (this.pos.x || this.pos.y)
            text += '\npos = ' + this.pos;
        if (this.localPos.x || this.localPos.y)
            text += '\localPos = ' + this.localPos;
        if (this.size.x || this.size.y)
            text += '\nsize = ' + this.size;
        if (this.color)
            text += '\ncolor = ' + this.color;
        return text;
    }

    /** Called if uiDebug is enabled
     *  @param {boolean} visible */
    renderDebug(visible=true)
    {
        // apply color based on state
        const color = 
            !visible ? GREEN :
            this.isHoverObject() ? YELLOW : 
            this.disabled ? PURPLE :
            this.interactive ? RED : BLUE;
        uiSystem.drawRect(this.pos, this.size, CLEAR_BLACK, 4, color);
    }

    /** Called each frame before object updates */
    onUpdate() {}

    /** Called each frame before object renders */
    onRender() {}

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

        // text can not be a hover object by default
        this.canBeHover = false;
        
        // no background by default
        this.color = CLEAR_BLACK;
        this.shadowColor = CLEAR_BLACK;
        this.gradientColor = undefined;
        this.lineWidth = 0;

        // use max fit scale by default
        this.textFitScale = 1;
    }
    render()
    {
        super.render();

        // render the text
        const textSize = this.getTextSize();
        uiSystem.drawText(this.text, this.pos, textSize, this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow, this.shadowColor, this.shadowBlur, this.shadowOffset);
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

        // no shadow by default
        this.shadowColor = CLEAR_BLACK;
    }
    render()
    {
        uiSystem.drawTile(this.pos, this.size, this.tileInfo, this.color, this.angle, this.mirror, this.shadowColor, this.shadowBlur, this.shadowOffset);
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

        /** @property {Vector2} - Text offset for the button */
        this.textOffset = vec2();

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
        uiSystem.drawText(this.text, this.pos.add(this.textOffset), textSize, 
            this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
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
            this.textColor, this.textLineWidth, this.textLineColor, 'left', this.font, this.fontStyle, false, this.textShadow);
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
        if (!this.interactive)
            return;

        const oldValue = this.value;
        if (this.isActiveObject())
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
            const p = uiSystem.screenToNative(mousePosScreen);
            this.value = isHorizontal ? 
                percent(p.x, p1, p2) :
                percent(p.y, p2, p1);
        }
        else if (this.isNavigationObject())
        {
            // gamepad/keyboard navigation adjustment
            const direction = uiSystem.getNavigationOtherDirection();
            if (!uiSystem.navigationTimer.active())
                this.value = clamp(this.value + direction*.01);
        }
        this.value === oldValue || this.onChange();
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
            this.textColor, this.textLineWidth, this.textLineColor, this.align, this.font, this.fontStyle, true, this.textShadow);
    }
    navigatePressed()
    {
        // toggle value between 0 and 1
        this.value = this.value ? 0 : 1;
        this.onRelease();
        super.navigatePressed();
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * VideoPlayerUIObject - A UI object that plays video
 * @extends UIObject
 * @example
 * // Create a video player UI object
 * const video = new VideoPlayerUIObject(vec2(400, 300), vec2(320, 240), 'cutscene.mp4', true);
 * video.play();
 * @memberof UISystem
 */
class UIVideo extends UIObject
{
    /** Create a video player UI object
     *  @param {Vector2} [pos]
     *  @param {Vector2} [size]
     *  @param {string} src - Video file path or URL
     *  @param {boolean} [autoplay=false] - Start playing immediately?
     *  @param {boolean} [loop=false] - Loop the video?
     *  @param {number} [volume=1] - Volume percent scaled by global volume (0-1)
     */
    constructor(pos, size, src, autoplay=false, loop=false, volume=1)
    {
        super(pos, size || vec2());
        
        ASSERT(isString(src), 'video src must be a string');
        ASSERT(isNumber(volume), 'video volume must be a number');

        this.color = BLACK; // default to black background
        this.cornerRadius = 0; // default to no corner radius

        /** @property {number} - The video volume */
        this.volume = volume;

        // create video element
        /** @property {HTMLVideoElement} - The video player */
        this.video = document.createElement('video');
        this.video.loop = loop;
        this.video.volume = clamp(volume * soundVolume);
        this.video.muted = !soundEnable;
        this.video.style.display = 'none';
        this.video.src = src;
        document.body.appendChild(this.video);
        autoplay && this.play();
    }
    
    /** Play or resume the video
     *  @return {Promise} Promise that resolves when playback starts */
    play()
    {
        // try to play the video, catch any errors (autoplay may be blocked)
        const promise = this.video.play();
        promise?.catch(()=>{});
        return promise;
    }
    
    /** Pause the video */
    pause() { this.video.pause(); }
    
    /** Stop and reset the video */
    stop() { this.video.pause(); this.video.currentTime = 0; }
    
    /** Check if video is currently loading
     *  @return {boolean} */
    isLoading()
    { return this.video.readyState < this.video.HAVE_CURRENT_DATA; }
    
    /** Check if video is currently paused
     *  @return {boolean} */
    isPaused() { return this.video.paused; }
    
    /** Check if video is currently playing
     *  @return {boolean} */
    isPlaying()
    { return !this.isPaused() && !this.hasEnded() && !this.isLoading(); }
    
    /** Check if video has ended playing
     *  @return {boolean} */
    hasEnded() { return this.video.ended; }
    
    /** Set volume (0-1)
     *  @param {number} volume - Volume level (0-1) */
    setVolume(volume)
    {
        this.volume = volume;
        this.video.volume = clamp(volume * soundVolume);
    }
    
    /** Set playback speed
     *  @param {number} rate - Playback rate multiplier */
    setPlaybackRate(rate) { this.video.playbackRate = rate; }
    
    /** Get current time in seconds
     *  @return {number} Current playback time */
    getCurrentTime() { return this.video.currentTime || 0; }
    
    /** Get duration in seconds
     *  @return {number} Total video duration */
    getDuration() { return this.video.duration || 0; }
    
    /** Get the native video dimensions 
     *  @return {Vector2} Video dimensions (may be 0,0 if metadata not loaded) */
    getVideoSize()
    { return vec2(this.video.videoWidth, this.video.videoHeight); }
    
    /** Seek to time in seconds
     *  @param {number} time - Time in seconds to seek to */
    setTime(time)
    { this.video.currentTime = clamp(time, 0, this.getDuration()); }

    update()
    {
        super.update();

        // update volume based on global sound volume
        this.video.volume = clamp(this.volume * soundVolume);
    }
    
    /** Render video to UI canvas */
    render()
    {
        super.render();

        if (this.isLoading())
            return;
        const context = uiSystem.uiContext;
        const s = this.size;
        context.save();
        context.translate(this.pos.x, this.pos.y);
        context.drawImage(this.video, -s.x/2, -s.y/2, s.x, s.y);
        context.restore();
    }
    
    /** Clean up video on destroy */
    destroy()
    {
        if (this.destroyed)
            return;

        this.video.pause();
        this.video.remove();
        super.destroy();
    }
}