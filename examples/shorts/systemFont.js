function gameRender()
{
    // draw text with built in font image system font
    const font = new FontImage;
    font.drawText('System Font Test', cameraPos.add(vec2(0,3)), .2, true);

    // show every character in the system font
    let s = '';
    for(let i=32; i<128; ++i)
    {
        if (i%32 == 0)
            s += '\n';
        s += String.fromCharCode(i);
    }
    font.drawText(s, cameraPos, .1, true);
}