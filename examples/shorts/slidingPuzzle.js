const gridSize = vec2(4,3);
const pieceSize = vec2(5,4);
let emptyGridPos = vec2();

class PuzzlePiece extends EngineObject
{
    constructor(gridPos, size)
    {
        const x = gridPos.x, y = gridPos.y;
        const color = rgb(x/(gridSize.x-1), y/(gridSize.y-1), 1);
        super(gridPos.multiply(size), size, 0, 0, color);
        this.gridPos = gridPos;
        this.text = x + y*gridSize.x;
        this.moveTimer = new Timer;
        this.lastPos = this.pos;
    }

    update()
    {
        const deltaX = emptyGridPos.x - this.gridPos.x;
        const deltaY = emptyGridPos.y - this.gridPos.y;
        if (mouseWasPressed(0))
        if (isOverlapping(this.pos, this.size, mousePos))
        if (abs(deltaX) + abs(deltaY) === 1)
        {
            // swap with empty space when clicked on
            this.lastPos = this.pos;
            this.pos = emptyGridPos.multiply(this.size);
            [emptyGridPos, this.gridPos] = [this.gridPos, emptyGridPos];
            this.moveTimer.set(.2);
        }
    }

    render()
    {
        const movePercent = this.moveTimer.getPercent();
        const pos = this.lastPos.lerp(this.pos, movePercent);
        drawRect(pos, this.size, this.color);
        drawTextOverlay(this.text, pos, 2.5, BLACK);
    }
}

function gameInit()
{
    // create puzzle pieces
    for (let x=gridSize.x; x--;)
    for (let y=gridSize.y; y--;)
        (x||y) && new PuzzlePiece(vec2(x,y), pieceSize);

    // center camera on grid
    cameraPos = gridSize.subtract(vec2(1)).multiply(pieceSize).scale(.5);
}