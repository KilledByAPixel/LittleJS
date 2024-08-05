import {
    drawTile,
    engineInit,
    TileInfo,
    vec2,
} from './../../dist/littlejs.esm.js';

let tileInfo1;
let tileInfo2;

function init() {
    tileInfo1 = new TileInfo(vec2(0, 16), vec2(8), 0); 
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
    'image1.png',
];
engineInit(init, update, updatePost, render, renderPost, imagesList);