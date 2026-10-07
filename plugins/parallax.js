/**
 * LittleJS Parallax Plugin
 * - A background layer that follows the camera by a part of its movement, so it looks far away
 * - Repeats across the view, so a level of any width has a background
 * - Draws mountains by default, or anything a game draws into it
 * @namespace Parallax
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/**
 * A background layer with parallax: an image that follows the camera by a part of its movement and repeats across
 * the view, drawn once into a canvas by a function, mountains when none is given
 * - A far layer has a parallax near 1 and a low renderOrder, a near one a smaller parallax and a higher renderOrder
 * - The image should meet itself at its left and right edges to repeat without a seam, as the mountains do
 * @memberof Parallax
 * @extends CanvasLayer
 * @example
 * // three ranges of mountains, the far ones lighter and slower
 * for (let i = 3; i--;)
 *     new ParallaxLayer(vec2(0, i*2), vec2(40, 20), .9 - i*.2, -1e3 + i,
 *         parallaxMountains(hsl(.6, .3, .7 - i*.2), hsl(.6, .5, .2), i));
 *
 * // or draw your own image into the layer
 * new ParallaxLayer(vec2(), vec2(40, 20), .5, -1e3, (context, size)=>
 * {
 *     context.fillStyle = '#fff';
 *     context.fillRect(size.x/2 - 20, size.y/2 - 20, 40, 40);
 * });
 */
class ParallaxLayer extends CanvasLayer
{
    /** Create a parallax layer and draw its image
     *  @param {Vector2} [pos] - Where the middle of the image is in the world when the camera is there too
     *  @param {Vector2} [size] - World size of one copy of the image
     *  @param {number|Vector2} [parallax] - How much of the camera's movement it follows, 0 stays with the world
     *    and 1 with the screen, a Vector2 to follow x and y by different amounts
     *  @param {number} [renderOrder] - Low to draw behind the game, far layers lowest
     *  @param {function(OffscreenCanvasRenderingContext2D, Vector2, ParallaxLayer): void} [drawFunction] - Draws
     *    the image, given the canvas context, its size in pixels and the layer; mountains when not given
     *  @param {Vector2} [canvasSize] - Size of the image in pixels */
    constructor(pos=vec2(), size=vec2(32, 16), parallax=.5, renderOrder=-1e3, drawFunction=parallaxMountains(),
        canvasSize=vec2(512, 256))
    {
        ASSERT(isNumber(parallax) || isVector2(parallax), 'parallax must be a number or a Vector2');
        ASSERT(typeof drawFunction == 'function', 'drawFunction must be a function');
        super(pos, size, 0, renderOrder, canvasSize);
        this.castShadow = false; // a backdrop, it would throw huge shadows in the light system, a sun's above all

        /** @property {Vector2} - How much of the camera's movement it follows on each axis, 0 stays with the world
         *  and 1 with the screen */
        this.parallax = isVector2(parallax) ? /** @type {Vector2} */ (parallax).copy() :
            vec2(/** @type {number} */ (parallax));
        /** @property {boolean} - Repeat the image across the view, left and right */
        this.wrapX = true;
        /** @property {boolean} - Repeat the image up and down the view */
        this.wrapY = false;
        /** @property {number} - How much the camera's zoom changes its size on the screen: 1 like the world, 0 not
         *  at all, the same on the screen at any zoom as it is at zoomScale */
        this.zoomFollow = 1;
        /** @property {number} - The camera scale its size is given for, used when zoomFollow is under 1 */
        this.zoomScale = cameraScale;
        /** @property {function(OffscreenCanvasRenderingContext2D, Vector2, ParallaxLayer): void} - Draws the
         *  image, redraw() after changing it */
        this.drawFunction = drawFunction;
        this.redraw();
    }

    /** Draw the image again with drawFunction, after changing it or what it draws from */
    redraw()
    {
        const context = this.context;
        if (!context) return; // headless
        const size = vec2(this.canvas.width, this.canvas.height);
        context.clearRect(0, 0, size.x, size.y);
        this.drawFunction(context, size, this);
        this.updateWebGL();
    }

    // how much smaller it is drawn than its size, from the camera's zoom and how much of it the layer follows
    zoomFactor()
    { return this.zoomFollow < 1 && cameraScale > 0 ? (this.zoomScale / cameraScale) ** (1 - this.zoomFollow) : 1; }

    /** World size one copy of the image is drawn at now, its size unless zoomFollow is under 1
     *  @return {Vector2} */
    getDrawSize() { return this.size.scale(this.zoomFactor()); }

    /** Where each copy of the image is drawn now, in the world: one place, or with wrapping every place that
     *  shows in the view
     *  @return {Array<Vector2>} */
    getDrawPositions()
    {
        // its place seen from the camera is cut down by the parallax, and by the zoom it does not follow
        const zoom = this.zoomFactor(), size = this.size.scale(zoom), p = this.parallax;
        const offset = this.pos.subtract(cameraPos);
        const center = cameraPos.add(vec2(offset.x * (1 - p.x) * zoom, offset.y * (1 - p.y) * zoom));

        // the copies that reach into the view; a turned camera sees as far as its corner each way
        const view = mainCanvasSize.scale(.5 / (cameraScale || 1));
        const reach = cameraAngle ? vec2(view.length()) : view;
        const range = (wrap, axis)=>
        {
            if (!wrap || !(size[axis] > 0)) return [0, 0];
            const from = cameraPos[axis] - reach[axis] - size[axis] / 2 - center[axis];
            const to = cameraPos[axis] + reach[axis] + size[axis] / 2 - center[axis];
            const first = ceil(from / size[axis]);
            return [first, min(floor(to / size[axis]), first + 99)]; // a tiny image does not draw without end
        };
        const [x0, x1] = range(this.wrapX, 'x'), [y0, y1] = range(this.wrapY, 'y'), positions = [];
        for (let y = y0; y <= y1; ++y)
        for (let x = x0; x <= x1; ++x)
            positions.push(vec2(center.x + x * size.x, center.y + y * size.y));
        return positions;
    }

    // Render the layer, called automatically by the engine
    render()
    {
        const size = this.getDrawSize();
        for (const pos of this.getDrawPositions())
            this.draw(pos, size, this.color, 0, this.mirror, this.additiveColor, false);
    }
}

///////////////////////////////////////////////////////////////////////////////

// the ridge of a range of mountains: a height for each column of an image and one more, the last the same as the
// first so the image repeats with no step; it wanders about the middle, turning now and then
function parallaxRidge(width, height, random)
{
    const pointiness = .2, levelness = .005, slopeRange = height / 256; // how often it turns, how hard it is
    const ridge = new Float32Array(width + 1), middle = height / 2;     // pulled level, how steep it gets
    let y = middle, slope = random.float(-slopeRange, slopeRange);
    for (let x = 0; x <= width; ++x)
    {
        ridge[x] = y;
        y += slope -= (y - middle) * levelness;
        if (random.float() < pointiness)
            slope = random.float(-slopeRange, slopeRange);
    }
    // take out the difference between its ends, a little from each column, and keep it inside the image
    const drift = ridge[width] - ridge[0];
    for (let x = 0; x <= width; ++x)
        ridge[x] = clamp(ridge[x] - drift * x / width, 0, height);
    return ridge;
}

/** A draw function for a ParallaxLayer: a range of mountains across the image, shaded from the color of their
 *  peaks down to the color of their feet, that repeats with no seam
 *  @param {Color} [topColor] - Color at the peaks
 *  @param {Color} [bottomColor] - Color at the bottom of the image
 *  @param {number} [seed] - The same seed gives the same mountains, random when not given
 *  @return {function(OffscreenCanvasRenderingContext2D, Vector2): void}
 *  @memberof Parallax */
function parallaxMountains(topColor=hsl(.6, .2, .6), bottomColor=hsl(.6, .3, .25), seed)
{
    return (context, size)=>
    {
        const w = size.x, h = size.y;
        const random = new RandomGenerator(seed === undefined ? randInt(1e9) + 1 : seed * 7919 + 1);
        const ridge = parallaxRidge(w, h, random);

        // a strip one pixel wide with the shading, stretched down each column from its peak
        const strip = createCanvasContext(1, h);
        for (let i = h; i--;)
        {
            strip.fillStyle = topColor.lerp(bottomColor, i / h).toString();
            strip.fillRect(0, i, 1, 1);
        }
        for (let x = w; x--;)
            ridge[x] < h && context.drawImage(strip.canvas, 0, 0, 1, h, x, ridge[x], 1, h - ridge[x]);
    };
}
