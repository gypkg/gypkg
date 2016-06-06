'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const util = require('util');
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;

const async = require('async');
const rimraf = require('rimraf');

const GYP_MAIN = path.join(__dirname, '..', 'tools', 'gyp', 'gyp_main.py');
const COMMON_GYPI = path.join(__dirname, '..', 'common.gypi');

const GIT = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH ||
            process.env.GIT_EXEC_PATH || 'git';

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

  const res = spawnSync('python', args, {
    env: env,
    stdio: [ 'inherit', null, 'pipe' ]
  });
  if (res.status !== 0)
    throw new Error(res.stderr.toString());
};

GYPKG.prototype.deps = function deps(list, callback) {
  async.map(list, (dep, callback) => {
    const match = dep.match(/^(.*):([^:]+):([^:]+)$/);
    if (!match)
      return callback(new Error('Dependency format is: "url:file.gyp:target"'));

    this.installDep(match[1], match[2], match[3], callback);
  }, callback)
};

GYPKG.prototype.installDep = function installDep(uri, gyp, target, callback) {
  let branch = uri.match(/#([^#]+)$/);
  if (branch !== null) {
    branch = branch[1];
    uri = uri.replace(/#[^#]+$/, '');
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
  else
    id += '@latest';

  if (parsed.host !== 'github.com')
    id = path.join(parsed.host, id);

  const INSTALL_DIR = path.join(process.env.GYPKG_DEPS, id);

  function done(err) {
    if (err)
      return callback(err);

    callback(null, path.join(INSTALL_DIR, gyp) + ':' + target);
  }

  // TODO(indutny): support semver (very large task)
  fs.exists(INSTALL_DIR, (exists) => {
    if (exists)
      return this.updateDep(INSTALL_DIR, uri, branch, done);
    else
      return this.cloneDep(INSTALL_DIR, uri, branch, done);
  });
};

GYPKG.prototype.git = function git(args, options, callback) {
  const git = spawn(GIT, args, util._extend({
    stdio: [ 'inherit', null, 'pipe' ]
  }, options));

  let chunks = '';
  git.stderr.on('data', chunk => chunks += chunk);

  git.on('exit', (code) => {
    if (code !== 0)
      return callback(new Error(`git ${args.join(' ')} failed\n${chunks}`));

    return callback(null);
  });
};

GYPKG.prototype.updateDep = function updateDep(target, uri, branch, callback) {
  const options = { cwd: target };
  const args = [ 'pull', uri ];

  if (branch)
    args.push(branch);

  this.git(args, options, callback);
};

GYPKG.prototype.cloneDep = function cloneDep(target, uri, branch, callback) {
  const args = [ 'clone', '--depth', 1 ];
  if (branch)
    args.push('--branch', branch);
  args.push(uri, target);

  this.git(args, {}, callback);
};
