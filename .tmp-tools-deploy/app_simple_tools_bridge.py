"""Compatibility entry point for code expecting the original app module.

Use `load()` to obtain the configured app_simple snapshot.  The standalone
server uses the same bridge, choosing the parent application when it exists
and the bundled vendor copy when this folder is moved on its own.
"""

from tools_core import load_tools_app


def load(use_parent_db: bool = False):
    return load_tools_app(use_parent_db=use_parent_db)[0]
