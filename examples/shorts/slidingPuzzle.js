const gridWidth = 4;
const pieceSize = vec2(5,4);
const sound_click = new Sound([1,0,440]);
let emptyGridPos = vec2();

class PuzzlePiece extends EngineObject
{
    constructor(gridPos)
    {
        const pos = gridPos.multiply(pieceSize);
        const color = rgb(x/(gridWidth-1), y/(gridWidth-1), 1);
        super(pos, pieceSize, 0, 0, color);
        this.gridPos = gridPos;
        this.text = gridPos.x + gridWidth*gridPos.y;
    }

    update()
    {
        if (mouseWasPressed(0) && isOverlapping(this.pos, this.size, mousePos))
        if (abs(this.gridPos.x-emptyGridPos.x) + abs(this.gridPos.y-emptyGridPos.y) == 1)
        {
            // swap with empty space when clicked on
            this.pos = emptyGridPos.multiply(pieceSize);
            [emptyGridPos, this.gridPos] = [this.gridPos, emptyGridPos];
            sound_click.play();
        }
    }

    render()
    {
        super.render();
        drawTextOverlay(this.text, this.pos, 2.5, BLACK);
    }
}

function gameInit()
{
    // create puzzle pieces
    for(x=gridWidth; x--;)
    for(y=gridWidth; y--;)
        (x||y) && new PuzzlePiece(vec2(x,y));
    cameraPos = vec2(gridWidth-1).multiply(pieceSize).scale(.5);
}