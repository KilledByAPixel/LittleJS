function gameRender()
{
    const font = new FontImage;
    font.drawText('System Font Test ', cameraPos.add(vec2(0,3)), .2, true);

    for(let j=1; j<4; j++)
    {
        let s = '';
        for(let i=0; i<32; ++i)
            s += String.fromCharCode(32*j + i);
        font.drawText(s, cameraPos.add(vec2(0,1-j)), .1, true);
    }
}

