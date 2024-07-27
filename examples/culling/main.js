// occlusion culling in LittleJS
// code and tutorial by Esmail Jamshidiasl (@ejamshidiasl)


import * as l from './../../build/littlejs.esm.js';


const rects = []; // our game objects
const rectsCount = 5000; // how many  game object in one group?
const rectsGroups = []; // our smaller groups
const rectsGroupsCount = 10; // split world to how many groups?
const rectsGroupsBound = 15; // bound to add game objects
const camSpeed = 0.25; // camera move speed
const bound = 10; // camera bound to check

function gameInit() {

  // number of rects that added to world:
  // rectsCount * rectsGroupsCount * rectsGroupsCount

  console.log('rects to draw: ' + (rectsCount * rectsGroupsCount * rectsGroupsCount));

  for (let i = 0; i < rectsGroupsCount; i++) {
    for (let j = 0; j < rectsGroupsCount; j++) {
      const tmpRects = [];
      for (let z = 0; z < rectsCount; z++) {
        const b2 = rectsGroupsBound / 2;
        const r = {
          pos: l.vec2(l.rand(i * rectsGroupsBound - b2, i * rectsGroupsBound + b2), l.rand(j * rectsGroupsBound - b2, j * rectsGroupsBound + b2)),
          size: l.vec2(l.rand(1, 3), l.rand(1, 3)),
          angle: l.rand(1, 360),
          color: l.randColor(),
        };
        rects.push(r);
        tmpRects.push(r);
      }

      rectsGroups.push({
        pos: l.vec2(i * rectsGroupsBound, j * rectsGroupsBound),
        render: false,
        children: tmpRects
      });
    }
  }

}

function gameUpdate() {

  // move camera with WASD keys
  if (l.keyIsDown('KeyD')) { l.setCameraPos(l.vec2(l.cameraPos.x + camSpeed, l.cameraPos.y)); }
  else if (l.keyIsDown('KeyA')) { l.setCameraPos(l.vec2(l.cameraPos.x - camSpeed, l.cameraPos.y)); }

  if (l.keyIsDown('KeyW')) { l.setCameraPos(l.vec2(l.cameraPos.x, l.cameraPos.y + camSpeed)); }
  else if (l.keyIsDown('KeyS')) { l.setCameraPos(l.vec2(l.cameraPos.x, l.cameraPos.y - camSpeed)); }

  //check if groups are in bound 
  rectsGroups.forEach(group => {
    if (
      group.pos.x > l.cameraPos.x - bound &&
      group.pos.x < l.cameraPos.x + bound &&
      group.pos.y > l.cameraPos.y - bound &&
      group.pos.y < l.cameraPos.y + bound
    ) {
      group.render = true;
    }
    else { group.render = false; }
  });

}

function gameUpdatePost() {
}

function gameRender() {

  //render visible groups
  for (let i = 0; i < rectsGroupsCount * rectsGroupsCount; i++) {
    const rg = rectsGroups[i];
    if (rg.render) {
      for (let z = 0; z < rectsCount; z++) {
        rg.children[z].angle += 0.04;
        l.drawRect(rg.children[z].pos, rg.children[z].size, rg.children[z].color, rg.children[z].angle);
      }
    }
  }

}

function gameRenderPost() {
}

l.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);