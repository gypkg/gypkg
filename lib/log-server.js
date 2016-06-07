'use strict';

const net = require('net');
const util = require('util');

function LogServer(options) {
  net.Server.call(this, this.onConnection);

  this.options = options || {};
}
module.exports = LogServer;
util.inherits(LogServer, net.Server);

LogServer.prototype.onConnection = function onConnection(c) {
  let line = '';

  const emit = this.options.verbose ? (line) => {
    this.emit('log', line);
  } : () => {};

  c.on('data', (chunk) => {
    line += chunk;
    if (!/\n/.test(line))
      return;

    const lines = line.split(/\n/g);
    line = lines.pop();
    lines.forEach(line => emit(line));
  });

  const done = () => {
    if (line.trim())
      emit(line);
  };
  c.on('error', done);
  c.on('end', done);
};
