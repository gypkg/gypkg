{
  "variables": {
    "gypkg_deps": [
      # Place for `gypkg` dependencies
      "git://github.com/gypkg/ringbuffer@^1.0.1 => ringbuffer.gyp:ringbuffer",
    ],
  },

  "targets": [ {
    "target_name": "test",
    "type": "executable",

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
      "src/main.c",
    ],
  } ],
}
