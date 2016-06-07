'use strict';

const gypkg = require('../gypkg');

const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const util = require('util');
const net = require('net');
const crypto = require('crypto');
const spawn = require('child_process').spawn;

const async = require('async');
const semver = require('semver');

const GYP_MAIN = path.join(__dirname, '..', '..',
                           'tools', 'gyp', 'gyp_main.py');
const COMMON_GYPI = path.join(__dirname, '..', '..', 'common.gypi');

const PYTHON = process.env.PYTHON || 'python';
const GIT = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH ||
            process.env.GIT_EXEC_PATH || 'git';

function Server(options) {
  net.Server.call(this, this.onClient);

  this.options = options;

  this.host = process.env.GYPKG_CMD_HOST || '127.0.0.1';
  this.port = process.env.GYPKG_CMD_PORT | 0;
  this.depsDir = null;

  // Filter out dependencies duplicates
  this.dups = new Map();
}
util.inherits(Server, net.Server);
module.exports = Server;

Server.prototype.onClient = function onClient(c) {
  const cmd = new gypkg.CommandSocket(c);

  cmd.on('log', text => this.emit('log', text));
  cmd.on('deps', (list) => {
    this.deps(list, (err, list) => {
      if (err)
        return this.emit('error', err);

      cmd.send('deps-result', list);
    });
  });
};

Server.prototype.generate = function generate(gyp, extra, callback) {
  this.listen(this.port, this.host, () => {
    this.port = this.address().port;
    this.host = this.address().address;

    this.log(`(Listening on ${this.host}:${this.port})`);

    this._generate(gyp, extra, callback);
  });

  return this;
};

Server.prototype._generate = function _generate(gyp, extra, callback) {
  const GYP_FILE = path.resolve(gyp);
  const ROOT_DIR = path.dirname(GYP_FILE);
  const OUT_DIR = path.join(ROOT_DIR, 'out');

  this.depsDir = path.join(ROOT_DIR, 'gypkg_deps');

  const OPTIONS_GYPI = path.resolve(ROOT_DIR, 'options.gypi');
  let args = [
    GYP_MAIN,
    GYP_FILE,
    `-I${COMMON_GYPI}`,
    `--depth=${path.resolve('.')}`
  ];

  if (fs.existsSync(OPTIONS_GYPI))
    args.push(`-I${OPTIONS_GYPI}`);

  // Default to make
  if (process.platform !== 'win32') {
    if (!extra.some(arg => arg === '-f'))
      args.push('-f', 'make');
    if (!extra.some(arg => arg === 'ninja')) {
      args.push(`-Goutput_dir=${OUT_DIR}`);
      args.push(`--generator-output=${OUT_DIR}`);
    }
  }

  if (!extra.some(arg => /^-Dhost_arch=/.test(arg)))
    args.push(`-Dhost_arch=${os.arch()}`);
  if (!extra.some(arg => /^-Dtarget_arch=/.test(arg)))
    args.push(`-Dtarget_arch=${os.arch()}`);

  // Compatibility with existing GYP files
  if (!extra.some(arg => /^-Dlibrary=/.test(arg)))
    args.push(`-Dlibrary=static_library`);

  args = args.concat(extra);

  this.log('Running GYP with the following arguments:');
  this.log(`  ${args.slice(1).join(' ')}`);

  const env = {};
  util._extend(env, process.env);
  env.GYPKG_CMD_HOST = this.host;
  env.GYPKG_CMD_PORT = this.port;

  const proc = spawn(PYTHON, args, {
    env: env,
    stdio: 'inherit'
  });

  proc.on('exit', (code) => {
    if (code !== 0)
      return callback(new Error('GYP failure'));

    this.log('...done');
    this.close(() => callback(null));;
  });
};

Server.prototype.deps = function deps(list, callback) {
  async.map(list, (dep, callback) => {
    const match = dep.match(/^(.*)(?::|\s*=>\s*)([^:]+):([^:]+)$/);
    if (!match)
      return callback(new Error('Dependency format is: "url:file.gyp:target"'));

    this.installDep(match[1], match[2], match[3], callback);
  }, callback)
};

Server.prototype.log = function log(line) {
  if (this.options.verbose)
    this.emit('log', line);
};

Server.prototype.installDep = function installDep(uri, gyp, target, callback) {
  let branch = uri.match(/#([^#]+)$/);
  let version = uri.match(/@([^@:]+)$/);

  if (branch !== null) {
    branch = branch[1];
    version = null;
    uri = uri.replace(/#[^#]+$/, '');
  } else if (version !== null) {
    branch = null;
    version = version[1];
    uri = uri.replace(/@([^@:]+)$/, '');
  }

  uri = uri.replace(/^git@([^:]*):(.*)(?:.git)?$/, 'git+ssh://$1/$2');
  const parsed = url.parse(uri);

  // Local file
  if (!parsed.protocol) {
    if (branch)
      return callback(new Error('Can\'t use a branch of a local dependency'));

    this.log(`local install: ${parsed.path}`);
    return callback(null, path.join(parsed.path, gyp) + ':' + target);
  }

  let id = parsed.path.slice(1);
  if (branch)
    id += '@' + branch;
  else if (version)
    id += '@semver-' + this.semVerHash(version);
  else
    id += '@latest';

  if (parsed.host !== 'github.com')
    id = path.join(parsed.host, id);

  const INSTALL_DIR = path.join(this.depsDir, id);

  // Already installing the dependency, avoid git lock problems
  if (this.dups.has(INSTALL_DIR)) {
    const entry = this.dups.get(INSTALL_DIR);

    if (entry.err !== null || entry.result !== null) {
      process.nextTick(() => callback(entry.err, entry.result));
      return;
    }

    entry.queue.push(callback);
    return;
  }

  const dupsEntry = { err: null, result: null, queue: [] };
  this.dups.set(INSTALL_DIR, dupsEntry);

  const done = (err, dir) => {
    callback(err, dir);

    dupsEntry.err = err;
    dupsEntry.result = dir;
    for (let i = 0; i < dupsEntry.queue.length; i++)
      dupsEntry.queue[i](err, dir);
  };

  this.log(`${id} => remote install: ${uri}`);

  async.waterfall([
    (callback) => {
      fs.exists(INSTALL_DIR, (exists) => callback(null, exists));
    },
    (exists, callback) => {
      if (exists)
        this.updateDep(id, INSTALL_DIR, uri, branch, callback);
      else
        this.cloneDep(id, INSTALL_DIR, uri, branch, callback);
    },
    (callback) => {
      if (!version)
        return callback(null, INSTALL_DIR);

      this.checkoutSemVer(id, INSTALL_DIR, uri, version, callback);
    }
  ], (err, depDir) => {
    if (err)
      return done(err);

    done(null, path.join(depDir, gyp) + ':' + target);
  });
};

Server.prototype.semVerHash = function semVerHash(version) {
  return crypto.createHash('sha256').update(version).digest('hex')
      .slice(0, 7);
};

function captureStream(stream) {
  let chunks = '';
  let ended = false;
  stream.on('data', chunk => chunks += chunk);
  stream.on('end', () => ended = true);

  return (callback) => {
    if (ended)
      return callback(chunks);

    stream.once('end', () => callback(chunks));
  };
}

Server.prototype.git = function git(args, options, callback) {
  const git = spawn(GIT, args, util._extend({
    stdio: [ 'inherit', 'pipe', 'pipe' ]
  }, options.spawn));

  const stderr = captureStream(git.stderr);
  const stdout = captureStream(git.stdout);

  git.on('exit', (code) => {
    if (code !== 0) {
      stderr((stderr) => {
        return callback(new Error(`git ${args.join(' ')} failed\n${stderr}`));
      });
      return;
    }

    if (options.stdout) {
      stdout((stdout) => callback(null, stdout));
      return;
    }

    return callback(null);
  });
};

Server.prototype.updateDep = function updateDep(id, target, uri, branch,
                                                callback) {
  const options = { spawn: { cwd: target } };

  this.log(`${id} => git fetch: ${uri}`);

  this.git([ 'fetch', 'origin' ], options, (err) => {
    if (err)
      return callback(err);

    if (!branch)
      return callback(null);

    this.git([ 'reset', '--hard', branch ], options, callback);
  });
};

Server.prototype.cloneDep = function cloneDep(id, target, uri, branch,
                                              callback) {
  const args = [ 'clone' ];
  if (branch)
    args.push('--depth', '1', '--branch', branch);
  args.push(uri, target);

  this.log(`${id} => git clone: ${uri}`);
  this.git(args, {}, callback);
};

Server.prototype.checkoutSemVer = function checkoutSemVer(id, target, uri,
                                                          version, callback) {
  const options = { spawn: { cwd: target }, stdout: true };

  this.log(`${id} => checking out semver: ${version}`);
  async.waterfall([
    (callback) => {
      this.git([ 'tag', '--list' ], options, callback);
    },
    (tags, callback) => {
      tags = tags.split('\n').filter((tag) => {
        return /^v/.test(tag);
      }).filter((tag) => {
        try {
          return semver.satisfies(tag, version);
        } catch (e) {
          return false;
        }
      }).sort((a, b) => {
        return semver.gt(a, b) ? -1 : semver.lt(a, b) ? 1 : 0;
      });

      if (tags.length === 0) {
        return callback(
            new Error(`No matching version found, ${uri}:${version}`));
      }
      callback(null, tags[0]);
    },
    (tag, callback) => {
      const options = { spawn: { cwd: target } };

      this.log(`${id} => semver match: ${tag}`);

      this.git([ 'reset', '--hard', tag ], options, (err) => {
        callback(err, tag);
      });
    },
    (tag, callback) => {
      const src = path.basename(target);
      const dst = target.replace(/@semver-[0-9a-f]+$/, '') + '@' + tag;

      fs.exists(dst, (exists) => callback(null, src, dst, exists));
    },
    (src, dst, exists, callback) => {
      if (exists)
        return callback(null, dst);

      fs.symlink(src, dst, 'dir', (err) => {
        if (!err || err.code === 'EEXIST')
          return callback(null, dst);
        callback(err);
      });
    }
  ], callback);
};
