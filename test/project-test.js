'use strict';
/* global describe it */
/* eslint-disable no-console */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const rimraf = require('rimraf');
const spawnSync = require('child_process').spawnSync;

const gypkg = path.join(__dirname, '..', 'bin', 'gypkg');
const projectsDir = path.join(__dirname, 'projects');
const tests = fs.readdirSync(projectsDir);

function build(name) {
  it(`should build ${name}`, function() {
    this.timeout(15000);

    const folder = path.join(projectsDir, name);
    rimraf.sync(path.join(folder, 'out'));

    const stdio = [ null, null, 'inherit' ];
    const spawnOpts = {
      stdio: stdio,
      cwd: folder,
      env: util._extend(util._extend({}, process.env), {
        PATH: process.env.PATH + ':' + path.dirname(gypkg)
      })
    };

    let p = spawnSync(process.execPath, [ gypkg, 'build' ], spawnOpts);
    if (p.status !== 0 && p.stdout)
      console.error(p.stdout.toString());
    if (p.error)
      throw p.error;
    assert.equal(p.status, 0, `cd ${name} && \`gypkg build\` failed`);

    p = spawnSync(path.join(folder, 'out', 'Release', 'test'), [], spawnOpts);
    if (p.status !== 0 && p.stdout)
      console.error(p.stdout.toString());
    if (p.error)
      return cb(p.error);
    assert.equal(p.status, 0, `test ${name}`);
  });
}

describe('projects', () => {
  tests.forEach(build);
});
