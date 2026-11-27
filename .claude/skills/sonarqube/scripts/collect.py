"""Copies what Git would publish, leaving out secrets (`.env`, except examples) and the private folder."""

import os
import shutil
import subprocess
import sys

root, target = sys.argv[1], sys.argv[2]
listed = subprocess.run(
    ["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], capture_output=True, check=True
).stdout.decode().split("\0")
count = 0
for path in listed:
    source, name = os.path.join(root, path), os.path.basename(path)
    if not path or not os.path.isfile(source) or os.path.islink(source):
        continue
    if path.startswith(("ignorar/", "datasets/", ".claude/")):
        continue
    if name.startswith(".env") and not name.endswith(".example"):
        continue
    destination = os.path.join(target, path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copy(source, destination)
    count += 1
print(f"Files to analyse: {count}")
