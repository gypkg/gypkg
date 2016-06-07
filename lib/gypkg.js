'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const util = require('util');
const crypto = require('crypto');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;

const async = require('async');
const rimraf = require('rimraf');
const semver = require('semver');

const GYP_MAIN = path.join(__dirname, '..', 'tools', 'gyp', 'gyp_main.py');
const COMMON_GYPI = path.join(__dirname, '..', 'common.gypi');

const PYTHON = process.env.PYTHON || 'python';
const GIT = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH ||
            process.env.GIT_EXEC_PATH || 'git';

const RETRY_TIMEOUT = 250;

function GYPKG() {
  // Nothing to initialize
}
module.exports = GYPKG;

GYPKG.prototype.generate = function generate(gyp, extra) {
  const GYP_FILE = path.resolve(gyp);
  const ROOT_DIR = path.dirname(GYP_FILE);
  const OUT_DIR = path.join(ROOT_DIR, 'out');

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

  const env = {};
  util._extend(env, process.env);
  env.GYPKG_DEPS = path.resolve(ROOT_DIR, 'gypkg_deps');

  console.log(`Running GYP with arguments:\n  ${args.slice(1).join(' ')}`);

  const res = spawnSync(PYTHON, args, {
    env: env,
    stdio: [ 'inherit', null, 'pipe' ]
  });
  if (res.status !== 0)
    throw new Error(res.stderr.toString());
};

GYPKG.prototype.deps = function deps(list, callback) {
  // Filter out dependencies duplicates
  const dups = new Map();

  async.map(list, (dep, callback) => {
    const match = dep.match(/^(.*)(?::|\s*=>\s*)([^:]+):([^:]+)$/);
    if (!match)
      return callback(new Error('Dependency format is: "url:file.gyp:target"'));

    this.installDep(dups, match[1], match[2], match[3], callback);
  }, callback)
};

GYPKG.prototype.installDep = function installDep(dups, uri, gyp, target,
                                                 callback) {
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

  const INSTALL_DIR = path.join(process.env.GYPKG_DEPS, id);

  // Already installing the dependency, avoid git lock problems
  if (dups.has(INSTALL_DIR)) {
    dups.get(INSTALL_DIR).push(callback);
    return;
  }

  const dupsQueue = [];
  dups.set(INSTALL_DIR, dupsQueue);

  const done = (err, dir) => {
    callback(err, dir);

    dups.delete(INSTALL_DIR);
    for (let i = 0; i < dupsQueue.length; i++)
      dupsQueue[i](err, dir);
  };

  async.waterfall([
    (callback) => {
      fs.exists(INSTALL_DIR, (exists) => callback(null, exists));
    },
    (exists, callback) => {
      if (exists)
        this.updateDep(INSTALL_DIR, uri, branch, callback);
      else
        this.cloneDep(INSTALL_DIR, uri, branch, callback);
    },
    (callback) => {
      if (!version)
        return callback(null, INSTALL_DIR);

      this.checkoutSemVer(INSTALL_DIR, uri, version, callback);
    }
  ], (err, depDir) => {
    if (err)
      return done(err);

    done(null, path.join(depDir, gyp) + ':' + target);
  });
};

GYPKG.prototype.semVerHash = function semVerHash(version) {
  return crypto.createHash('sha256').update(version).digest('hex')
      .slice(0, 7);
};

function captureStream(stream) {
  let chunks = '';
  let ended = false;
  stream.on('data', chunk => chunks += chunk);
  stream.on('end', () => stderrEnded = true);

  return (callback) => {
    if (ended)
      return callback(chunks);

    stream.once('end', () => callback(chunks));
  };
}

GYPKG.prototype.git = function git(args, options, callback) {
  const git = spawn(GIT, args, util._extend({
    stdio: [ 'inherit', 'pipe', 'pipe' ]
  }, options.spawn));

  const stderr = captureStream(git.stderr);
  const stdout = captureStream(git.stdout);

  git.on('exit', (code) => {
    // Retry if locked, this may happen if two processes are attempting to
    // make changes to the same git checkout.
    if (code !== 0 && /index.lock/i.test(stderr)) {
      return setTimeout(() => this.git(args, options, callback),
                        RETRY_TIMEOUT);
    }

    if (code !== 0) {
      return callback(new Error(`git ${args.join(' ')} failed\n${stderr}`));
    }

    if (options.stdout) {
      if (!stdoutEnded)
        git.stdout.once('end', () => callback(null, stdout));
      else
        callback(null, stdout);
      return;
    }

    return callback(null);
  });
};

GYPKG.prototype.updateDep = function updateDep(target, uri, branch, callback) {
  const options = { spawn: { cwd: target } };

  this.git([ 'fetch', 'origin' ], options, (err) => {
    if (err)
      return callback(err);

    if (!branch)
      return callback(null);

    this.git([ 'reset', '--hard', branch ], options, callback);
  });
};

GYPKG.prototype.cloneDep = function cloneDep(target, uri, branch, callback) {
  const args = [ 'clone' ];
  if (branch)
    args.push('--depth', '1', '--branch', branch);
  args.push(uri, target);

  this.git(args, {}, callback);
};

GYPKG.prototype.checkoutSemVer = function checkoutSemVer(target, uri, version,
                                                         callback) {
  const options = { spawn: { cwd: target }, stdout: true };

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
