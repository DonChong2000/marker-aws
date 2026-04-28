import os
from pathlib import Path

# Lambda remounts /var/lang (the Python runtime) read-only at container start,
# even for custom container images. marker-pdf deps (fasthtml/monsterui) try to
# create site-packages/static at import time, which hits EROFS without this patch.
# sitecustomize.py runs before any user code, so the patch is in place early enough.

_BLOCKED = "/var/lang/lib/python3.12/site-packages/static"
_REDIRECT = "/tmp/marker-static"

os.makedirs(_REDIRECT, exist_ok=True)


def _remap(path):
    s = str(os.fspath(path))
    if s == _BLOCKED or s.startswith(_BLOCKED + "/"):
        tail = s[len(_BLOCKED):]
        if isinstance(path, Path):
            return Path(_REDIRECT + tail)
        return _REDIRECT + tail
    return path


_orig_makedirs = os.makedirs
_orig_mkdir = os.mkdir


def _patched_makedirs(name, mode=0o777, exist_ok=False):
    remapped = _remap(name)
    return _orig_makedirs(remapped, mode=mode, exist_ok=exist_ok or remapped is not name)


def _patched_mkdir(path, mode=0o777, *, dir_fd=None):
    return _orig_mkdir(_remap(path), mode)


os.makedirs = _patched_makedirs
os.mkdir = _patched_mkdir

_path_mkdir = Path.mkdir


def _patched_path_mkdir(self, mode=0o777, parents=False, exist_ok=False):
    remapped = _remap(self)
    if remapped is not self:
        parents, exist_ok = True, True
    return _path_mkdir(remapped, mode=mode, parents=parents, exist_ok=exist_ok)


Path.mkdir = _patched_path_mkdir
