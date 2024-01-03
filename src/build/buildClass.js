const fs = require("node:fs");

/**
  A class representing a single build with its own source files, build steps, and output file
*/
class Build {
  #files;
  #outputFile;
  #buildSteps;

  constructor() {
    this.#files = [];
    this.#outputFile = "out.js";
    this.#buildSteps = [];
  }

  addSourceFile(filename) {
    this.#files.push(filename);
    return this;
  }

  setOutputFile(filename) {
    this.#outputFile = filename;
    return this;
  }

  /**
   *
   * @param {buildStepCallback} cb - A callback that accepts a `filename` as its only argument representing the file to execute this step on.
   * @returns {this}
   */
  addBuildStep(cb) {
    this.#buildSteps.push(cb);
    return this;
  }

  /**
   * @returns {boolean} Whether build completed successfully or not.
   */
  build() {
    // read files
    const files = this.#files;
    if (!files.length) {
      console.error(
        "No files given to build. Make sure you add files with `addSourceFile` before building."
      );
      return false; // no files, this should be an error
    }

    // concat files into one buffer
    let buf = fs.readFileSync(files[0]);
    buf += "\n";
    // Start with i = 1 since we init buffer with 0th index
    for (let i = 1; i < files.length; i += 1) {
      buf += fs.readFileSync(files[i]);
      buf += "\n";
    }

    // output file
    fs.writeFileSync(this.#outputFile, buf, { flag: "w+" });

    // go through build steps in order
    const buildSteps = this.#buildSteps;
    for (let i = 0; i < buildSteps.length; i += 1) {
      buildSteps[i](this.#outputFile);
    }
  }

  get sourceFiles() {
    return this.#files;
  }

  get outputFile() {
    return this.#outputFile;
  }
}

/**
 * Callback provided to run a build step in the Build class.
 * @callback buildStepCallback
 * @param {string} filename
 */

module.exports = { Build };
