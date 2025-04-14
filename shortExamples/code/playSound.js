class SoundButton extends EngineObject
{
    constructor(pos, icon, sound)
    {
        super(pos, vec2(5,4));
        this.icon = icon;
        this.sound = sound;
    }

    update()
    {
        if (mouseWasPressed(0) && isOverlapping(this.pos, this.size, mousePos))
            this.sound.play(this.pos);
    }

    render()
    {
        drawRect(this.pos, this.size, hsl(0,0,.8));
        drawTextOverlay(this.icon, this.pos, 3);
    }
}

function gameInit()
{
    new SoundButton(vec2(-6, 5),'💰', new Sound([,,1675,,.06,.24,1,1.82,,,837,.06]));
    new SoundButton(vec2( 0, 5),'🥊', new Sound([,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]));
    new SoundButton(vec2( 6, 5),'✨', new Sound([,,539,0,.04,.29,1,1.92,,,567,.02,.02,,,,.04]));

    new SoundButton(vec2(-6, 0),'🐁', new Sound([,.2,1e3,.02,,.01,2,,18,,475,.01,.01]));
    new SoundButton(vec2( 0, 0),'🎹', new Sound([1.5,.5,270,,.1,,1,1.5,,,,,,,,.1,.01]));
    new SoundButton(vec2( 6, 0),'🏌️', new Sound([,,150,.05,,.05,,1.3,,,,,,3]));
    
    new SoundButton(vec2(-6,-5),'🌊', new Sound([,.2,40,.5,,1.5,,11,,,,,,199]));
    new SoundButton(vec2( 0,-5),'🛰️', new Sound([,.5,847,.02,.3,.9,1,1.67,,,-294,.04,.13,,,,.1]));
    new SoundButton(vec2( 6,-5),'⚡', new Sound([,,471,,.09,.47,4,1.06,-6.7,,,,,.9,61,.1,,.82,.1]));
}