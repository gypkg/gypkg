'use strict';

const gypkg = require('../gypkg');

const net = require('net');

function Client() {
  this.GYPKG_DEPS = process.env.GYPKG_DEPS;

  this.host = process.env.GYPKG_CMD_HOST || '127.0.0.1';
  this.port = process.env.GYPKG_CMD_PORT | 0;

  if (this.port === 0)
    throw new Error('Please use `gypkg gen ...` instead');

  this.socket = net.connect({
    port: this.port,
    host: this.host
  });

  this.cmdSocket = new gypkg.CommandSocket(this.socket);
}
module.exports = Client;

Client.prototype.destroy = function destroy() {
  return this.socket.destroy();
};

Client.prototype.cmd = function cmd(name, list, callback) {
  if (name === 'deps')
    return this.deps(list, callback);
  else
    return this.type(callback);
};

Client.prototype.deps = function deps(list, callback) {
  this.cmdSocket.send('deps', list);
  this.cmdSocket.on('deps-result', (list) => {
    this.destroy();
    callback(null, list);
  });
  this.cmdSocket.on('error', callback);
};

Client.prototype.type = function type(callback) {
  this.cmdSocket.send('type', process.cwd());
  this.cmdSocket.on('type-result', (out) => {
    this.destroy();
    callback(null, out);
  });
  this.cmdSocket.on('error', callback);
};
