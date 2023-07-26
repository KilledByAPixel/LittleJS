#!/bin/bash
# TypeScript build script for LittleJS by Frank Force

BUILD_FOLDER=build

npx tsc
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi

# copy output js file and remove build folder
cp $BUILD_FOLDER/examples/typescript/game.js game.js
rm -rf $BUILD_FOLDER