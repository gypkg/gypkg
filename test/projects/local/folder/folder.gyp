{
  "variables": {
    "gypkg_deps": [
      # Place for `gypkg` dependencies
    ],
  },

  "targets": [ {
    "target_name": "folder",
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
      "folder.c",
    ],
  } ],
}
