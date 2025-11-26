function gameRender()
{
    // draw text with built in engine font image
    const font = engineFontImage;
    font.drawText('Engine Font', vec2(0,3), 2);

    // show every character in the font
    let s = '';
    for (let i=32; i<128; ++i)
    {
        if (i%32 == 0)
            s += '\n';
        s += String.fromCharCode(i);
    }

    font.drawText(s, vec2());
}