# gypkg

**HIGHLY UNSTABLE**

A [GYP][0]-based package manager for C projects.

## Installation

```bash
# Node.js is required to run this
npm install -g gypkg
```

## Usage

A `.gyp` file for a C project may be written like this:
```json
{
  "targets": [{
    "target_name": "proj",
    "type": "<!(gypkg type)",

    "variables": {
      "gypkg_deps": [
        # repo-addr@semver:path/to/file.gyp:target_name
        "git://github.com/libuv/libuv@^1.9.1:uv.gyp:libuv",
      ],
    },

    "dependencies": [
      "<!@(gypkg deps <(gypkg_deps))"
    ],

    "direct_dependent_settings": [
      "include_dirs": [ "include" ],
    ],

    "sources": [
      "src/main.c",
    ],
  }]
}
```

Then a `gypkg` CLI tool can be used to generate a `Makefile` (or any other
build system's file support by [GYP][0]):

```bash
gypkg gen file.gyp -- -Duv_library=static-library
make -C out/ -j9
```

`gen` command will install all dependencies into `gypkg_deps` and will update
them automatically on next `gen` call.

## Examples

* [file-shooter.gyp][1]

*TODO(indutny): write detailed readme*

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
