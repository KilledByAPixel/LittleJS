const gridSize = vec2(4,3);
const pieceSize = vec2(5,4);
let emptyGridPos = vec2();

class PuzzlePiece extends EngineObject
{
    constructor(gridPos, size)
    {
        const color = rgb(gridPos.x/(gridSize.x-1), gridPos.y/(gridSize.y-1), 1);
        super(gridPos.multiply(size), size, 0, 0, color);
        this.gridPos = gridPos;
        this.text = gridPos.x + gridPos.y*gridSize.x;
    }

    update()
    {
        if (mouseWasPressed(0) && isOverlapping(this.pos, this.size, mousePos))
        if (abs(this.gridPos.x-emptyGridPos.x) + abs(this.gridPos.y-emptyGridPos.y) == 1)
        {
            // swap with empty space when clicked on
            this.pos = emptyGridPos.multiply(this.size);
            [emptyGridPos, this.gridPos] = [this.gridPos, emptyGridPos];
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
    for(let x=gridSize.x; x--;)
    for(let y=gridSize.y; y--;)
        (x||y) && new PuzzlePiece(vec2(x,y), pieceSize);

    // center camera on grid
    cameraPos = gridSize.subtract(vec2(1)).multiply(pieceSize).scale(.5);
}