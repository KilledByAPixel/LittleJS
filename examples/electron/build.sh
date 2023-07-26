#!/bin/bash

# Simple build script for LittleJS by Frank Force
# Minfies and combines index.html and index.js and zips the result

NAME="game"
BUILD_FOLDER="build"
BUILD_FILENAME="index.js"

# remove old files
rm -rf "$BUILD_FOLDER"
mkdir "$BUILD_FOLDER"
pushd "$BUILD_FOLDER"

# copy engine release build
cat ../../../build/littlejs.release.js >> "$BUILD_FILENAME"
echo "" >> "$BUILD_FILENAME"

# add your game's files to include here
cat ../game.js >> "$BUILD_FILENAME"
echo "" >> "$BUILD_FILENAME"

# copy images to build folder
cp ../tiles.png tiles.png

# minify code with uglify
npx uglifyjs -o "$BUILD_FILENAME" --compress --mangle -- "$BUILD_FILENAME"
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi

# build the html, you can add html header and footers here
# cat ../header.html >> index.html
echo "<body><script>" >> index.html
cat "$BUILD_FILENAME" >> index.html
echo "</script>" >> index.html

# delete intermediate files
rm "$BUILD_FILENAME"

# copy electron files to build folder
cp ../electron.js electron.js
cp ../package.json package.json

popd

# build with electron
npx electron-packager "./$BUILD_FOLDER" --overwrite
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi
read -p "Build completed successfully. Press any key to continue..."