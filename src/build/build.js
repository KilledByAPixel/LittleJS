#!/bin/usr/env node

const start = performance.now();

const fs = require("node:fs");
const child_process = require("node:child_process");
const { Build } = require("./buildClass");

const BUILD_DIR = "build";
const ENGINE_NAME = "littlejs";

// Nuke build dir and recreate
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR);

const closureCompilerStep = (filename) => {
  fs.copyFileSync(filename, `${filename}.tmp`);
  try {
    child_process.execSync(
      `npx google-closure-compiler --js=${filename}.tmp --js_output_file=${filename} --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off="*"`
    );
  } catch (e) {
    console.error(e);
    console.error(
      "Failed to run Google Closure Compiler step... Make sure the file is valid before running?"
    );
    process.exit(1);
  }
  fs.rmSync(`${filename}.tmp`);
};

const uglifyBuildStep = (filename) => {
  try {
    child_process.execSync(`npx uglifyjs -o ${filename} -- ${filename}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

// Build engine -- all
{
  const build = new Build();
  build
    .addSourceFile("src/engineDebug.js")
    .addSourceFile("src/engineUtilities.js")
    .addSourceFile("src/engineSettings.js")
    .addSourceFile("src/engineObject.js")
    .addSourceFile("src/engineDraw.js")
    .addSourceFile("src/engineInput.js")
    .addSourceFile("src/engineAudio.js")
    .addSourceFile("src/engineTileLayer.js")
    .addSourceFile("src/engineParticles.js")
    .addSourceFile("src/engineMedals.js")
    .addSourceFile("src/engineWebGL.js")
    .addSourceFile("src/engine.js")
    .setOutputFile(`build/${ENGINE_NAME}.js`)
    .build();
}

// Build engine -- release
{
  const build = new Build();
  build
    .addSourceFile("src/engineRelease.js")
    .addSourceFile("src/engineUtilities.js")
    .addSourceFile("src/engineSettings.js")
    .addSourceFile("src/engine.js")
    .addSourceFile("src/engineObject.js")
    .addSourceFile("src/engineDraw.js")
    .addSourceFile("src/engineInput.js")
    .addSourceFile("src/engineAudio.js")
    .addSourceFile("src/engineTileLayer.js")
    .addSourceFile("src/engineParticles.js")
    .addSourceFile("src/engineMedals.js")
    .addSourceFile("src/engineWebGL.js")
    .setOutputFile(`build/${ENGINE_NAME}.release.js`)
    .build();
}

// Build engine -- minified
{
  const build = new Build();
  build
    .addSourceFile(`build/${ENGINE_NAME}.release.js`)
    .setOutputFile(`build/${ENGINE_NAME}.min.js`)
    .addBuildStep(closureCompilerStep)
    .addBuildStep(uglifyBuildStep)
    .build();
}

// Build engine -- ESM
{
  const build = new Build();
  build
    .addSourceFile(`build/${ENGINE_NAME}.js`)
    .addSourceFile("src/engineExport.js")
    .setOutputFile(`build/${ENGINE_NAME}.esm.js`)
    .build();
}

// Build engine -- ESM minified / release
{
  const build = new Build();
  build
    .addSourceFile(`build/${ENGINE_NAME}.min.js`)
    .addSourceFile("src/engineExport.js")
    .setOutputFile(`build/${ENGINE_NAME}.esm.min.js`)
    .addBuildStep(uglifyBuildStep)
    .build();
}

// Run tsc to create type definitions
try {
  child_process.execSync(
    `npx tsc build/${ENGINE_NAME}.esm.js --declaration --allowJs --emitDeclarationOnly --outFile build/${ENGINE_NAME}.d.ts`
  );
} catch (e) {
  console.error(e);
  process.exit(1);
}

const end = performance.now();
const duration = end - start;

console.log(`Build completed in ${duration.toFixed(2)} ms.`);
