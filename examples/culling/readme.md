## occlusion culling
increases rendering performance simply by not rendering game objects that are outside the view.

## when use and when not using this method
if your game has few game objects (less than 100.000) so it is better to avoid culling. but if your game has more than 100.000 (even millions) and game is kind of open world then you need culling. also if you want to render all game objects in small area (not moving camera) then culling cannot reduce render time. 

## how many game objects it can handle?
dozens of millions! in this test i added 2.500.000 rectangle that rotating and rendered at `60 FPS`.

## how to test
run game and move with WASD keys and see how group's visibility changes when come in/out bound. (in this test i decreased camera bound to see how it effects)

## how to do
1. split world to smaller parts (groups)
```javascript
const rectsGroups = [];
const rectsGroupsCount = 10;
const rectsGroupsBound = 15;
```
2. add game objects to groups
```javascript
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
```
3. check which groups are in camera bounds (forEach is not good 😁)
```javascript
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
```
4. render children of the groups that are in bound
```javascript
for (let i = 0; i < rectsGroupsCount * rectsGroupsCount; i++) {
    const rg = rectsGroups[i];
    if (rg.render) {
      for (let z = 0; z < rectsCount; z++) {
        rg.children[z].angle += 0.04;
        l.drawRect(rg.children[z].pos, rg.children[z].size, rg.children[z].color, rg.children[z].angle);
      }
    }
  }
```

## IMPORTANT question
why we are not just adding game objects to world and then check if a game object is in bound then render that?
because when we add millions of gameobjects, searching in a list with lots of items takes lot of time and has very bad effect.

## is it possible to use other types of game objects?
YES, actually we can add any type of game object that we want. just a little changes needed