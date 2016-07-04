'use strict';

const fs = require('fs');
const path = require('path');
const read = require('read');
const async = require('async');

function formatName(name) {
  return name.replace(/[^a-z0-9_\-.]+/i, '-');
}

module.exports = function init(out) {
  const cwd = out === undefined ? process.cwd() :
                                  path.dirname(path.resolve(out));

  async.waterfall([
    (callback) => {
      read({ prompt: 'name', default: path.basename(cwd) },
           (err, name) => callback(err, name));
    },
    (name, callback) => {
      const file = out === undefined ?
          formatName(name) + '.gyp':
          out;

      read({ prompt: 'output file', default: file },
           (err, file) => callback(err, name, file));
    },
    (name, file, callback) => {
      fs.exists(file, (exists) => callback(null, file, name, exists));
    },
    (file, name, exists, callback) => {
      if (exists) {
        return callback(
            new Error(`GYP file "${file}" already exists, can't proceed`));
      }

      create(file, { name: name }, (err) => callback(err, file));
    },
    (file, callback) => {
      console.log(`Created ${path.relative('.', file)}`);
      callback(null);
    }
  ], (err) => {
    if (err)
      throw err;
  });
};

function create(file, options, callback) {
  fs.writeFile(file, `{
    "variables": {
      "gypkg_deps": [
        # Place for \`gypkg\` dependencies
      ],
    },

    "targets": [ {
      "target_name": ${JSON.stringify(options.name)},
      "type": "<!(gypkg type)",

      "dependencies": [
        "<!@(gypkg deps <(gypkg_deps))",
        # Place for local dependencies
      ],

      "direct_dependent_settings": {
        "include_dirs": [
          # Place for public includes
          "include",
        ],
      },

      "include_dirs": [
        # Place for private includes
        ".",
      ],

      "sources": [
        # Place for source files
      ],
    } ],
  }
  `.replace(/^  /gm, ''), callback);
}
