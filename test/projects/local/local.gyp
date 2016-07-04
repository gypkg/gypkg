{
  "variables": {
    "gypkg_deps": [
      # Place for `gypkg` dependencies
      "folder => folder.gyp:folder",
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
      "main.c",
    ],
  } ],
}
