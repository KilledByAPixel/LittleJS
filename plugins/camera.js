/**
 * LittleJS Camera Plugin
 * - Camera objects that drive the view, so a game need not move cameraPos itself
 * - FollowCamera follows a 2D target with smoothing, an offset, a dead zone, a look ahead, level bounds and zoom
 * - The 3D cameras, ThirdPersonCamera3D, CameraControl3D and FirstPersonCamera3D, drive the view the same way
 * - The newest camera made drives the view; destroy it and the one before takes over from where the view is
 * - Cameras update after the objects move each update, so they are never a frame behind, and hold while paused
 * - cameraShake works with or without a camera object
 * @namespace Camera
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// the cameras made, the last one live drives the view
const cameraList = [];
// the camera that drove the view last update
let cameraDriving;
// the plugin hook is added with the first camera
let cameraPluginAdded = false;

// make a camera the one that drives the view, called by each camera's activate
function cameraActivate(camera)
{
    const i = cameraList.indexOf(camera);
    i >= 0 && cameraList.splice(i, 1);
    cameraList.push(camera);
    if (!cameraPluginAdded)
    {
        cameraPluginAdded = true;
        engineAddPlugin(undefined, undefined, undefined, undefined, undefined, cameraUpdatePost);
    }
}

// update the camera that drives the view, after the objects moved, called by the engine each update
// a camera that takes over from another starts from where the view is, one just made from where it snapped
function cameraUpdatePost()
{
    for (let i = cameraList.length; i--;)
        cameraList[i].destroyed && cameraList.splice(i, 1);
    if (paused || engineFrozenTick) return; // held while paused or at time scale 0
    const camera = cameraList[cameraList.length - 1];
    if (camera && camera !== cameraDriving && !camera.cameraNew)
        camera.takeView();
    for (const c of cameraList)
        c.cameraNew = false;
    cameraDriving = camera;
    camera?.updateCamera();
}

// how much of a gap smoothing closes this update, smoothing a time constant in seconds, 0 closes all of it
function cameraSmoothFactor(smoothing) { return smoothing > 0 ? 1 - Math.exp(-timeDelta / smoothing) : 1; }

///////////////////////////////////////////////////////////////////////////////

/**
 * FollowCamera - The 2D camera: follows a target and drives cameraPos, and cameraScale when it has a scale
 * - Smoothing is in seconds, so it comes out the same at any frame rate
 * - A dead zone lets the target move about without the view moving
 * - lookAhead shows more of the way the target is going, sliding across when it turns
 * - boundsMin and boundsMax keep the view over the level, centered where the level is smaller than the view;
 *   they go by the view's size without cameraAngle
 * - Its pos is the middle of the view, before any cameraShake
 * - The newest camera made drives the view; a game can still change cameraPos in gameUpdatePost for that frame
 * - Destroy it to stop it driving the view, which stays where it was
 * @extends EngineObject
 * @memberof Camera
 * @example
 * const camera = new FollowCamera(player);
 * camera.lookAhead = vec2(3, 0);   // see further the way the player runs
 * camera.boundsMin = vec2();       // keep the view over the level
 * camera.boundsMax = levelSize;
 */
class FollowCamera extends EngineObject
{
    /** Make a follow camera, the view goes to its target at once
     *  @param {EngineObject|Vector2} [target] - What to follow, an object or a position
     *  @param {number} [smoothing] - Seconds it takes to close most of the gap, 0 snaps */
    constructor(target, smoothing=.1)
    {
        ASSERT(!target || target instanceof EngineObject || isVector2(target),
            'FollowCamera: target must be an EngineObject or a vec2', target);
        ASSERT(isNumber(smoothing) && smoothing >= 0, 'FollowCamera: smoothing must be 0 or more seconds', smoothing);
        super(cameraPos, vec2());
        this.mass = 0; // nothing pulls or pushes it

        /** @property {EngineObject|Vector2|undefined} - What it follows; destroyed or undefined, the view holds
         *  @type {EngineObject|Vector2|undefined} */
        this.target = target;
        /** @property {number} - Seconds it takes to close most of the gap to the target, 0 snaps */
        this.smoothing = smoothing;
        /** @property {Vector2} - Where the target sits from the middle of the view, the view moved by it */
        this.offset = vec2();
        /** @property {Vector2} - Size of a box in the middle of the view the target moves in without the view moving */
        this.deadZone = vec2();
        /** @property {Vector2} - How much more it shows the way the target goes on each axis, 0 for none */
        this.lookAhead = vec2();
        /** @property {number} - How far the target must go back the other way before the look turns, so a jiggle
         *  does not flip it */
        this.lookAheadTurn = 1;
        /** @property {number} - Seconds the look takes to slide across when it turns */
        this.lookAheadSmoothing = .5;
        /** @property {Vector2|undefined} - Lowest corner of the area the view stays in
         *  @type {Vector2|undefined} */
        this.boundsMin = undefined;
        /** @property {Vector2|undefined} - Highest corner of the area the view stays in, Infinity on an axis leaves
         *  that side open
         *  @type {Vector2|undefined} */
        this.boundsMax = undefined;
        /** @property {number|undefined} - The cameraScale it eases to, undefined leaves cameraScale to the game
         *  @type {number|undefined} */
        this.scale = undefined;
        /** @property {number} - Seconds the zoom takes to close most of the gap to scale, 0 snaps */
        this.scaleSmoothing = .2;

        this.cameraNew = true;       // made this update, it starts where it snapped and not from the view
        this.lookOffset = vec2();    // how far the look moves the view now
        this.lookDirection = vec2(); // which way it looks on each axis, -1, 0 or 1
        this.lookTravel = vec2();    // how far the target has gone back against the look since it last went with it
        this.lookFrom = undefined;   // where the target was last update, to see which way it moves
        this.lookTarget = undefined; // the object lookFrom is of, a new one starts measuring again
        this.activate();
        this.snap();
    }

    /** Make this the camera that drives the view, it starts from where the view is */
    activate() { cameraActivate(this); }

    /** Start from where the view is, called when it takes over from another camera */
    takeView() { this.pos = cameraPos.copy(); }

    /** Put the view on the target at once, with no easing, for a level start or a teleport */
    snap()
    {
        if (this.scale !== undefined)
            setCameraScale(this.scale);
        this.lookFrom = undefined; // a teleport is not a move to look along
        this.updateLook(true);
        const focus = this.getFocus();
        if (focus)
            this.pos = focus;
        this.pos = this.inBounds(this.pos);
        setCameraPos(this.pos);
    }

    /** Move toward the target and set the view, called by the camera plugin after the objects update */
    updateCamera()
    {
        if (this.scale !== undefined)
            setCameraScale(cameraScale + (this.scale - cameraScale) * cameraSmoothFactor(this.scaleSmoothing));
        this.updateLook();
        const focus = this.getFocus();
        if (focus)
        {
            // the view moves only as far as puts the focus back in the dead zone
            const half = this.deadZone.scale(.5), pos = this.pos;
            const goal = vec2(clamp(pos.x, focus.x - half.x, focus.x + half.x),
                clamp(pos.y, focus.y - half.y, focus.y + half.y));
            this.pos = pos.lerp(goal, cameraSmoothFactor(this.smoothing));
        }
        this.pos = this.inBounds(this.pos);
        setCameraPos(this.pos);
    }

    // where the target is, undefined with none or a destroyed one
    getTargetPos()
    {
        const target = this.target;
        if (!target || target instanceof EngineObject && target.destroyed) return;
        return target instanceof EngineObject ? target.pos : target;
    }

    // where the view wants its middle: the target, the offset and the look, undefined with no live target
    getFocus()
    {
        const pos = this.getTargetPos();
        return pos && pos.add(this.offset).add(this.lookOffset);
    }

    // turn the look by which way the target moved, and slide it toward that side, at once when snapping
    // on each axis the first move sets the look; it turns once the target has gone back lookAheadTurn the other way
    updateLook(snap)
    {
        if (this.target !== this.lookTarget && this.target instanceof EngineObject)
            this.lookTarget = this.target, this.lookFrom = undefined; // a new target, not a move
        const pos = this.getTargetPos(), from = this.lookFrom;
        if (!pos) return;
        if (from)
        {
            const turn = (axis)=>
            {
                const move = pos[axis] - from[axis], direction = this.lookDirection[axis];
                if (!this.lookAhead[axis] || !move) return;
                if (!direction)
                    this.lookDirection[axis] = sign(move);
                else if (sign(move) === direction)
                    this.lookTravel[axis] = 0;
                else if ((this.lookTravel[axis] += abs(move)) > this.lookAheadTurn)
                    this.lookDirection[axis] = -direction, this.lookTravel[axis] = 0;
            };
            turn('x');
            turn('y');
        }
        this.lookFrom = pos.copy();
        const goal = this.lookDirection.multiply(this.lookAhead);
        this.lookOffset = this.lookOffset.lerp(goal, snap ? 1 : cameraSmoothFactor(this.lookAheadSmoothing));
    }

    // a view middle moved so the view stays in the bounds, centered on an axis where they are smaller than it
    inBounds(pos)
    {
        const low = this.boundsMin, high = this.boundsMax;
        if (!low && !high) return pos;
        const half = getCameraSize().scale(.5);
        const axis = (p, a, b, h)=>
            a !== undefined && b !== undefined && b - a <= 2*h ? (a + b) / 2 :
            clamp(p, a === undefined ? -Infinity : a + h, b === undefined ? Infinity : b - h);
        return vec2(axis(pos.x, low?.x, high?.x, half.x), axis(pos.y, low?.y, high?.y, half.y));
    }

    /** A camera is moved only by its target, physics leaves it alone */
    updatePhysics() {}

    /** A camera draws nothing */
    render() {}
}
