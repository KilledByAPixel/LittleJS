function gameInit()
{
    gravity.y = -.01; // set default gravity

    // fire
    new ParticleEmitter(
        vec2(-5,-2), 0,                 // pos, angle
        2, 0, 200, PI,                  // emitSize, emitTime, emitRate, emitCone
        tile(0),                        // tileInfo
        rgb(1,.5,.1), rgb(1,.1,.1),     // colorStartA, colorStartB
        rgb(1,.5,.1,0), rgb(1,.1,.1,0), // colorEndA, colorEndB
        .7, 2, 0, .2, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -1, PI, .05,  // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 1, 0, 1e9     // randomness, collide, additive, colorLinear, renderOrder
    );
    
    // smoke
    new ParticleEmitter(
        vec2(5,-2), 0,                    // pos, angle
        3, 0, 100, PI,                    // emitSize, emitTime, emitRate, emitCone
        tile(0),                          // tileInfo
        hsl(0,0,0,.5), hsl(0,0,1,.5),     // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,1,0), // colorEndA, colorEndB
        1, 1, 5, .2, .01,    // time, sizeStart, sizeEnd, speed, angleSpeed
        .85, 1, -1, PI, .3,  // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 0, 1, 1e8     // randomness, collide, additive, colorLinear, renderOrder
    );
}