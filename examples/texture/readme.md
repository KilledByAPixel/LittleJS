## Textures

texture is an image but on GPU. in this eample we learn how to load textures and draw them.

### load texture
to load texture we can add our image's path and name to textures list in `engineInit` function.
```javascript
const imagesList = [
    'asset/character.png',
    'asset/trees.png'
];
engineInit(init, update, updatePost, render, renderPost, imagesList);
```
order of images in `imagesList` is important. each image has a <b>uniqe INDEX</b> that we need these indexes to access them later.

### draw texture
we need some info about texture we want to draw for example which part of texture must be drawn. we use `TileInfo` class. (we can make many different tiles from a texture)
```javascript
let tileInfo1;
function gameInit() {
    tileInfo1 = new TileInfo(vec2(32, 16), vec2(16), 0);
}
```
`TileInfo` has 3 main properties:
- <b>start point</b>: position of top left corner of tile in texture `vec2(32, 16)`
- <b>size of tile</b>: size of tile we want to draw `vec2(16)`
- <b>texture index</b>: texture index ('asset/character.png' was first item in imagesList so index is `0`)

or to draw whole texture we can do this:
```javascript
tileInfo1 = new TileInfo();
tileInfo1.textureIndex = 0;
```
now we have info about texture so let's draw our tile with passing tileInfo to `drawTile` function:
```javascript
function gameRender() {
    drawTile(vec2(2,1), vec2(5), tileInfo);
}
```

### complete code
```javascript
import {
    drawTile,
    engineInit,
    TileInfo,
    vec2,
} from 'LITTLE JS PATH';

let tileInfo1;
let tileInfo2;

function init() {
    tileInfo1 = new TileInfo(vec2(64, 16), vec2(4), 0);

    tileInfo2 = new TileInfo(vec2(16, 16), vec2(16), 0);
}

function update() {
}

function updatePost() {
}

function render() {
    drawTile(vec2(), vec2(5), tileInfo1);

    drawTile(vec2(3,6), vec2(2), tileInfo2);
}

function renderPost() {
}


const imagesList = [
    'asset/character.png',
    'asset/trees.png'
];
engineInit(init, update, updatePost, render, renderPost, imagesList);
```
