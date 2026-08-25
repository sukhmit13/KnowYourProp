---
name: GitHub sync with oversized history
description: How to publish the current app without force-pushing when historical Git blobs exceed GitHub's 100 MB limit.
---

GitHub checks every blob reachable from a pushed branch, including old versions of files now managed by Git LFS. If historical oversized blobs cannot be pushed and force-pushing is not allowed, create a new clean snapshot commit directly on the remote tip from the current application tree instead of pushing the old history.

**Why:** GitHub rejects the entire ref update for reachable non-LFS blobs above 100 MB, even when the current version of the same file is an LFS pointer.

**How to apply:** Preserve the original local history on a local safety branch, exclude transient attachments, ensure current large files are LFS pointers, then create a new commit whose parent is the existing remote branch tip. This permits a normal fast-forward push while retaining the current code, but intentionally does not publish the old commit-by-commit history.