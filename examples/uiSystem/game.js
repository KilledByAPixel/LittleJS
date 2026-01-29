/*
    Little JS UI System Example
    - Shows how to use the LittleJS UI plugin
    - Modal windows, buttons, text, checkboxes, and more
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
const {vec2, hsl, tile} = LJS;

// UI system
let uiRoot, uiMenu;
const getMenuVisible =()=> uiMenu.visible;
const setMenuVisible =(visible)=> uiMenu.visible = visible;

// use a fixed size canvas
LJS.setCanvasFixedSize(vec2(1920, 1080)); // 1080p
LJS.setCanvasPixelated(false);

function createUI()
{
    LJS.uiSystem.defaultSoundPress = new LJS.Sound([.5,0,220]);
    LJS.uiSystem.defaultSoundClick = new LJS.Sound([.5,0,440]);
    LJS.uiSystem.defaultCornerRadius = 8;
    LJS.uiSystem.defaultGradientColor = LJS.WHITE;
    LJS.uiSystem.defaultShadowColor = LJS.BLACK;

    // setup root to attach all ui elements to
    uiRoot = new LJS.UIObject;
    const uiInfo = new LJS.UIText(vec2(0,90), vec2(1e3, 70), 
        'LittleJS UI System Example\nM = Toggle menu');
    uiInfo.textColor = LJS.WHITE;
    uiInfo.textLineWidth = 8;
    uiRoot.addChild(uiInfo);

    // setup example menu
    uiMenu = new LJS.UIObject(vec2(0,500));
    uiRoot.addChild(uiMenu);
    const uiBackground = new LJS.UIObject(vec2(), vec2(450,580));
    uiBackground.lineWidth = 8;
    uiMenu.addChild(uiBackground);

    // example large text
    const textTitle = new LJS.UIText(vec2(0,-220), vec2(400, 120), 'Test Title');
    uiMenu.addChild(textTitle);
    textTitle.textColor = LJS.RED;
    textTitle.textLineColor = LJS.BLUE;
    textTitle.textLineWidth = 4;

    // example multiline text
    const textTest = new LJS.UIText(vec2(-60,-120), vec2(300, 60), 'Test Text\nSecond text line.')
    uiMenu.addChild(textTest);

    // example tile image
    const tileTest = new LJS.UITile(vec2(150,-130), vec2(110), tile(3,128))
    uiMenu.addChild(tileTest);

    // setup navigation index for gamepad and keyboard navigation
    let navigationIndex = 0;
    
    // example checkbox
    const checkbox = new LJS.UICheckbox(vec2(-140,-20), vec2(50));
    uiMenu.addChild(checkbox);
    checkbox.onChange = ()=> button1.disabled = checkbox.checked;
    checkbox.navigationIndex = ++navigationIndex;
    checkbox.text = 'Test Checkbox';

    // example slider
    const slider = new LJS.UISlider(vec2(0,60), vec2(350, 50));
    uiMenu.addChild(slider);
    slider.onChange = ()=> slider.text = slider.value.toFixed(2)
    slider.onChange();
    slider.navigationIndex = ++navigationIndex;

    // example button
    const button1 = new LJS.UIButton(vec2(0,140), vec2(350, 50), 'Test Button');
    uiMenu.addChild(button1);
    button1.onClick = ()=> uiBackground.color = hsl(LJS.rand(),1,.7);
    button1.navigationIndex = ++navigationIndex;

    // exit button
    const button2 = new LJS.UIButton(vec2(0,220), vec2(350, 50), 'Exit Menu');
    uiMenu.addChild(button2);
    button2.onClick = ()=> LJS.uiSystem.showConfirmDialog('Exit menu?',
        ()=> setMenuVisible(false));
    button2.navigationIndex = ++navigationIndex;
    button2.navigationAutoSelect = true;
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    new LJS.UISystemPlugin;
    createUI();
    LJS.setCanvasClearColor(hsl(0,0,.2));
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    if (LJS.keyWasPressed('KeyM') && !LJS.uiSystem.confirmDialog)
    {
        // toggle menu visibility
        setMenuVisible(!getMenuVisible());
    }

    // center ui
    uiRoot.pos.x = LJS.mainCanvasSize.x/2;

    // pause when menu is visible
    LJS.setPaused(getMenuVisible())
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // test game rendering
    for (let i=0; i<1e3; ++i)
    {
        const pos = vec2(30*LJS.sin(i+LJS.time/9),20*LJS.sin(i*i+LJS.time/9));
        LJS.drawTile(pos, vec2(2), tile(3,128), hsl(i/9,1,.4), LJS.time+i, !(i%2), hsl(i/9,1,.1,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);