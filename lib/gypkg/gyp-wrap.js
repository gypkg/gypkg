'use strict';

const gypjs = require('gyp.js');

const code = gypjs.main(process.argv.slice(1));
process.exit(code);
