# gypkg
[![NPM version](https://badge.fury.io/js/gypkg.svg)](http://badge.fury.io/js/gypkg)
[![Build Status](https://secure.travis-ci.org/gypkg/gypkg.svg)](http://travis-ci.org/gypkg/gypkg)

A [GYP][0]-based package manager for C/C++ projects.

## Helping project

Please check the latest [issues][6], or contribute gypkg-projects to the
[wiki][7].

## Why?

[GYP][0] has a very lovely way to manage dependencies, however the amount of the
boilerplate code required to build a project is very huge:

* Project's own `gyp` repository checkout
* `common.gypi` file with default compiler warning flags, etc
* `gyp_project_name` executable python script to set proper [GYP][0] defines
  and execute `gyp_main.py`
* Dependencies checked out into the project tree

All of this has to be repeated in every project, but fear not - `gypkg` fixes
this and also a dependency management problem as well.

Additionally, `gypkg` solves the problem with duplicate sub-dependencies
(`a` depends on `b` and `c`; `b` depends on `c`).

## Installation

```bash
# Node.js is required to run this
npm install -g gypkg
```

## Demo

[![asciicast](https://asciinema.org/a/48171.png)](https://asciinema.org/a/48171)

## Usage

A `build.gyp` file for a C/C++ project may be generated with `gypkg init`, and
will look like this:
```python
{
  "variables": {
    "gypkg_deps": [
      # Place for `gypkg` dependencies
    ],
  },

  "targets": [ {
    "target_name": "my-lib",
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
```

Dependencies could be added to `gypkg_deps`:
```python
"gypkg_deps": [
  # repo-addr@semver => path/to/file.gyp:target_name
  "git://github.com/libuv/libuv@^1.9.1 => uv.gyp:libuv",
],
```

Source files to `sources`:
```python
"sources": [
  "src/main.c",
],
```

Then a `gypkg` CLI tool can be used to build a project (NOTE: while [`ninja`][5]
is not necessary, it is recommended for fast incremental builds):

```bash
gypkg build file.gyp -- -Duv_library=static-library
```

`build` command will install all dependencies into `gypkg_deps` and will update
them automatically on next `build` call.

## Dependency management

`gypkg` supports local and remote (git) dependencies. Remote dependencies are
installed into `gypkg_deps/` folder in the root directory of the project (the
one that has the main `.gyp` file). Nested dependencies still live in the same
`gypkg_deps/` in the root directory.

The syntax for declaring dependencies is:

* `/path/to/dependency => /sub/path/to/main.gyp:target_name` - use local
  dependency
* `git://github.com/author/project => /path/to/main.gyp:target_name` -
  checkout the latest commit of remote dependency. Note that (`https://` and
  `git@` are supported too)
* `git://github.com/author/project#branch => /path/to/main.gyp:target_name` -
  checkout particular branch/hash of remote dependency
* `git://github.com/author/project@semver => /path/to/main.gyp:target_name` -
  checkout whole repository and find the latest version-tag (the on that starts
  with `v`) that matches the particular `semver`
* `git://github.com/author/project@semver [gpg] => ...` -
  find the latest version tag matching `semver` and verify it's GPG signature
  and [`Git-EVTag-v0-SHA512`][8].

See [Usage][2] section above, or [Examples][3] below for particular gist of how
[GYP][0] file may look like.

## Examples

* [file-shooter.gyp][1]

## Compatbility

While Node.js implementation of `gypkg` loads dependencies in asynchronously and
in parallel, it may be required for gypkg-based project to be distributed to
the platforms without Node.js binaries.

In this case `gypkg gen --freeze file.gyp` can be used to generate
`.gypkg-freeze` file, which will help [./shim/gypkg][4] python shim in resolving
all dependencies statically.

`.gypkg-freeze` and [./shim/gypkg][4] should be distributed with the project in
such cases , and the project users should be advised to extend their `PATH`
environment variable with a folder that contains [./shim/gypkg][4] script.

## LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2016.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[0]: https://gyp.gsrc.io/
[1]: https://github.com/indutny/file-shooter/blob/master/file-shooter.gyp
[2]: #usage
[3]: #examples
[4]: https://github.com/gypkg/gypkg/blob/master/bin/gypkg
[5]: https://ninja-build.org/
[6]: https://github.com/gypkg/gypkg/issues
[7]: https://github.com/gypkg/gypkg/wiki/projects
[8]: https://github.com/cgwalters/git-evtag
