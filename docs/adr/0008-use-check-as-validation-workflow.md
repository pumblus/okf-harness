# Use check as the validation workflow

OKF Harness uses `check` as the user-facing workspace validation workflow instead of keeping `lint` as a parallel long-term command surface. `check` reports whether the OKF bundle is readable before showing Harness-specific provenance, citation, source integrity, and maintainability findings; retired `lint` usage points people to `check` rather than preserving duplicate behavior.
