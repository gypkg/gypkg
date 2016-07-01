'use strict';

const fs = require('fs');
const path = require('path');
const read = require('read');
const async = require('async');

module.exports = function init(args) {
  const file = path.resolve(args.length > 1 ? args[1] : 'main.gyp');

  async.waterfall([
    (callback) => {
      fs.exists(file, (exists) => callback(null, exists));
    },
    (exists, callback) => {
      if (exists) {
        return callback(
            new Error(`GYP file "${file}" already exists, can't proceed`));
      }

      read({ prompt: 'name', default: path.basename(path.dirname(file)) },
           callback);
    },
    (name, exists, callback) => {
      create(file, { name: name }, callback);
    }
  ], (err) => {
    if (err)
      throw err;

    console.log(`Created ${file}`);
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
