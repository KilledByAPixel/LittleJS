let seed = 1, leftDots, rightDots, die;
const rollDie = ()=> randInt(6)+1; // a whole number from 1 to 6

// 200 dots in a square 10 units wide: a place, a size and a color between
// two others, all at random
function randomDots()
{
    const dots = [];
    for (let i = 200; i--;)
        dots.push({pos: vec2(rand(-5,5), rand(-5,5)), size: rand(.2,.6),
            color: randColor(hsl(.6,1,.5), hsl(.9,1,.7))});
    return dots;
}

// the same dots from a RandomGenerator: the same seed gives the same dots
function seededDots(seed)
{
    const random = new RandomGenerator(seed), dots = [];
    for (let i = 200; i--;)
        dots.push({pos: random.vec2(-5,5), size: random.float(.2,.6),
            color: random.randColor(hsl(.6,1,.5), hsl(.9,1,.7))});
    return dots;
}

function gameInit()
{
    cameraScale = 34;
    leftDots = randomDots();
    rightDots = seededDots(seed);
    die = rollDie();
}

function gameUpdate()
{
    // click for new dots on the left and a new roll, space for the next seed
    if (mouseWasPressed(0))
    {
        leftDots = randomDots();
        die = rollDie();
    }
    if (keyWasPressed('Space'))
        rightDots = seededDots(++seed);
}

function gameRender()
{
    for (const [dots, x] of [[leftDots, -7], [rightDots, 7]])
    {
        drawRect(vec2(x, 0), vec2(10.5), hsl(0,0,.15));
        for (const dot of dots)
            drawCircle(dot.pos.add(vec2(x, 0)), dot.size, dot.color);
    }
    drawText('rand: new every time, click', vec2(-7, 6.5), .8);
    drawText('RandomGenerator, seed ' + seed + ': space', vec2(7, 6.5), .8);
    drawText('the die rolled a ' + die, vec2(0, -7), .7);
}

/* info
Two squares of two hundred dots, placed, sized and colored at random.
The left one is different every time it is made: click to make it
again. The right one comes from a seeded generator, so seed 1 always
gives the same dots: press Space for the next seed. Each click also
rolls a die.

## How it works
`rand(a, b)` returns a random number between the two, from the
browser's `Math.random`, and the others are built on it: `randInt(n)`
is a whole number from 0 up to but not including `n`, `randBool(chance)`
is true that fraction of the time, `randSign()` is 1 or -1, and
`randColor(a, b)` is a color with each channel between the two colors'
channels. `randInCircle` and `randVec2` give points and directions.
`rollDie` adds 1 to `randInt(6)`, which is 0 to 5, for a die.

### randomDots
Each dot is a plain object: a position with `rand(-5,5)` for x and for
y, a size, and a color between a blue and a pink. Nothing remembers
where a value came from, so making the list again gives new dots.

### seededDots
`new RandomGenerator(seed)` is a random number source of its own, with
the same functions as methods: `float`, `int`, `bool`, `sign`, `vec2`,
`direction` and `randColor`. Each call steps a number on from the seed,
so one seed always gives the same values in the same order. That is
what a game uses for a level that is the same on every play, or the
same on every player's machine, from a seed it can save or share.

`seededDots` makes its list the way `randomDots` does, taking each value
from the generator in place of `rand`. Space adds one to the seed and
makes the list again, and going back to seed 1 would give the first
square back exactly.

### gameRender
`drawRect` draws each dark square and `drawCircle(pos, size, color)` each
dot, the size being its diameter. `dot.pos.add(vec2(x, 0))` moves a
dot, placed around `vec2(0,0)`, over to its square.

## Try it
- Change `randInt(6)+1` to `randInt(20)+1` for a bigger die.
- Change `rand(.2,.6)` to `rand(.1,1.2)` for a wider range of sizes.
- Start from another seed: `seed = 1` to `seed = 42` at the top.
- Change the pink `hsl(.9,1,.7)` to a green `hsl(.3,1,.5)` in
  `randomDots`, and the left square's colors run from blue to green.

## See also
Noise is random that changes smoothly from place to place. Maze
Generator and Starfield make levels and stars from random values, and
Colors shows what `hsl` makes.
*/
