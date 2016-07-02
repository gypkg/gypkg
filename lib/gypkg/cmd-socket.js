'use strict';

const util = require('util');
const EventEmitter = require('events').EventEmitter;

function CommandSocket(socket) {
  EventEmitter.call(this);

  this.socket = socket;

  let line = '';

  const parse = (line) => {
    const obj = JSON.parse(line);

    if (obj.error)
      this.emit('error', obj.error);
    else
      this.emit(obj.cmd, obj.data);
  };

  socket.on('data', (chunk) => {
    line += chunk;
    if (!/\n/.test(line))
      return;

    const lines = line.split(/\n/g);
    line = lines.pop();
    lines.forEach(line => parse(line));
  });

  const done = () => {
    if (line.trim())
      parse(line);
  };
  socket.on('error', done);
  socket.on('end', done);
}
util.inherits(CommandSocket, EventEmitter);
module.exports = CommandSocket;

CommandSocket.prototype.send = function send(cmd, data) {
  this.socket.write(JSON.stringify({ cmd: cmd, data: data }) + '\n');
};

CommandSocket.prototype.error = function error(cmd, err) {
  this.socket.write(JSON.stringify({
    cmd: cmd,
    error: err.stack || err.message || (err + '')
  }) + '\n');
};
