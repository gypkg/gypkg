'use strict';

const gypkg = require('../gypkg');

const net = require('net');

function Client() {
  this.GYPKG_DEPS = process.env.GYPKG_DEPS;

  this.GYPKG_CMD_HOST = process.env.GYPKG_CMD_HOST || '127.0.0.1';
  this.GYPKG_CMD_PORT = process.env.GYPKG_CMD_PORT | 0;

  this.server = null;
}
module.exports = Client;

Client.prototype.deps = function deps(list, callback) {
  const s = net.connect({
    port: this.GYPKG_CMD_PORT,
    host: this.GYPKG_CMD_HOST
  });

  const cmd = new gypkg.CommandSocket(s);

  cmd.send('deps', list);

  cmd.on('deps-result', (list) => {
    s.destroy();

    callback(null, list);
  });

  s.on('error', callback);
};
