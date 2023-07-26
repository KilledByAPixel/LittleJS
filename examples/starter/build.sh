#!/bin/bash

# Simple build script for LittleJS by Frank Force
# Minfies and combines index.html and index.js and zips the result

NAME=game
BUILD_FOLDER=build
BUILD_FILENAME=index.js

# install dev packages
# call npm install

# remove old files
rm -f $NAME.zip
rm -rf $BUILD_FOLDER

# copy engine release build
mkdir $BUILD_FOLDER
pushd $BUILD_FOLDER

# rebuild engine first
pushd ../../../src
./engineBuild.sh
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi
popd

cat ../../../build/littlejs.release.js >> $BUILD_FILENAME
echo "" >> $BUILD_FILENAME

# add your game's files to include here
cat ../game.js >> $BUILD_FILENAME
echo "" >> $BUILD_FILENAME

# copy images to build folder
cp ../tiles.png tiles.png

# minify code with closure
mv $BUILD_FILENAME temp_$BUILD_FILENAME
npx google-closure-compiler --js=temp_$BUILD_FILENAME --js_output_file=$BUILD_FILENAME --compilation_level=ADVANCED --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi
rm temp_$BUILD_FILENAME

# more minification with uglify
npx uglifyjs -o $BUILD_FILENAME --compress --mangle -- $BUILD_FILENAME
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi

# roadroller compresses the code better then zip
npx roadroller $BUILD_FILENAME -o $BUILD_FILENAME
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi

# build the html, you can add an html header and footer here
# cat ../header.html >> index.html
echo "<script>" >> index.html
cat $BUILD_FILENAME >> index.html
echo "</script>" >> index.html
# cat ../footer.html >> index.html

# delete intermediate files
rm $BUILD_FILENAME

# zip the result, ect is recommended
chmod a+x ../../../node_modules/ect-bin/vendor/linux/ect
../../../node_modules/ect-bin/vendor/linux/ect -9 -strip -zip ../$NAME.zip index.html tiles.png
if [ $? -ne 0 ]; then
    read -p "Press any key to continue..."
    exit $?
fi

popd