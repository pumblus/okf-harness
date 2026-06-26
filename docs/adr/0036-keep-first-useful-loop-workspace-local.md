# Keep first useful loop workspace-local

The first useful loop should be completed through the workspace-local `okf-harness` entrypoint, not expanded into the global bootstrap entrypoint. Bootstrap may create or select a workspace, register requested local source material, prepare ingest plans, and hand off with refresh guidance; wiki synthesis, check, and the first-answer check belong in the selected workspace so bootstrap stays a low-frequency setup and repair path.
