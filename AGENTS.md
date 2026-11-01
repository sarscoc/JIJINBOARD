# Updating JIJINBOARD

- Start from the current remote default branch. Fetch and inspect its latest commit before editing; recheck the remote head before publishing. If it moved, integrate those changes and rerun the affected tests. Never force-push over newer work.
- Read the complete current files from the repository. Do not reconstruct application files from chat history, old attachments, cached copies, or truncated tool output. Make focused patches; preserve unrelated changes.
- MATRIX templates and placements are user data in D1/R2, not deployment fixtures. Never reset, seed, import, or overwrite production data as part of a code update. Existing templates must load without a destructive schema migration.
- Preserve template revision checks, atomic conditional writes, deletion tombstones, independent point storage, serialized browser saves, and the distinction between remote hydration and user edits. A stale editor must receive a conflict instead of overwriting newer template settings or images.
- Run `npm test` and JavaScript syntax checks for changed scripts before publishing. Extend the regression tests when changing MATRIX persistence. Do not remove these protections to make an older client write successfully.
