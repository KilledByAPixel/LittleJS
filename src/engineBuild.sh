#!/bin/bash

# Simple build script for LittleJS Engine by Frank Force
# Minfies and combines index.html and index.js and zips the result
# Run npm install first to install required dependencies

# --- BUILD ENGINE DEBUG ---

BUILD_FOLDER="build"
ENGINE_NAME="littlejs"

pushd ..

# remove old files
rm -rf "$BUILD_FOLDER"
mkdir "$BUILD_FOLDER"
pushd "$BUILD_FOLDER"

# --- BUILD ENGINE ALL ---

OUTPUT_FILENAME="$ENGINE_NAME.js"

# combine code
cat ../src/engineDebug.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineUtilities.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineSettings.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineObject.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineDraw.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineInput.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineAudio.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineTileLayer.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineParticles.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineMedals.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineWebGL.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engine.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"

# --- BUILD ENGINE RELEASE ---

OUTPUT_FILENAME="$ENGINE_NAME.release.js"

# combine code
cat ../src/engineRelease.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineUtilities.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineSettings.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engine.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineObject.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineDraw.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineInput.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineAudio.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineTileLayer.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineParticles.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineMedals.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineWebGL.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"

# --- BUILD ENGINE MINIFIED ---

OUTPUT_FILENAME="$ENGINE_NAME.min.js"

# start with release build
cp "$ENGINE_NAME.release.js" "$OUTPUT_FILENAME"

# check code with closure
mv "$OUTPUT_FILENAME" "$OUTPUT_FILENAME.temp"
npx google-closure-compiler --js="$OUTPUT_FILENAME.temp" --js_output_file="$OUTPUT_FILENAME" --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off=*
rm "$OUTPUT_FILENAME.temp"
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi

# lightly minify with uglify
npx uglifyjs -o "$OUTPUT_FILENAME" -- "$OUTPUT_FILENAME"
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi

# --- BUILD ENGINE ESM MODULE ---

OUTPUT_FILENAME="$ENGINE_NAME.esm.js"
cat "$ENGINE_NAME.js" >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineExport.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"

# --- BUILD ENGINE ESM MODULE RELEASE ---

OUTPUT_FILENAME="$ENGINE_NAME.esm.min.js"
cat "$ENGINE_NAME.min.js" >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"
cat ../src/engineExport.js >> "$OUTPUT_FILENAME"
echo "" >> "$OUTPUT_FILENAME"

# lightly minify with uglify
npx uglifyjs -o "$OUTPUT_FILENAME" -- "$OUTPUT_FILENAME"
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi

# --- BUILD TYPESCRIPT DEFINITIONS ---

npx tsc "$ENGINE_NAME.esm.js" --declaration --allowJs --emitDeclarationOnly --outFile "$ENGINE_NAME.d.ts"
if [ $? -ne 0 ]; then
    read -p "Error occurred. Press any key to continue..."
    exit $?
fi

popd
popd