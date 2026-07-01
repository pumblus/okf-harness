# Use short installer URLs backed by auditable script sources

OKF Harness should present short installer URLs at `https://okf-harness.dev/install.sh` and `https://okf-harness.dev/install.ps1` in ordinary user documentation, and those recommended URLs should install the latest public release. The short URLs should serve or redirect to auditable installer scripts published from the main repository or GitHub releases, with version-pinned install paths available for advanced or reproducible setup. This keeps the recommended install path readable and current without hiding the script source or making the installer a separate product surface.

Release notes should keep the `Install` section to the recommended installer script and point single-agent native install commands to documentation rather than listing every agent-specific command in the release body.

README installation should lead with a one-line command section: recommended macOS/Linux and Windows installer commands first, followed by an "Already have Node.js?" `npx @okf-harness/setup` path. Single-agent native install commands belong below that section, and direct `npm install -g @okf-harness/cli` belongs in advanced CLI-only documentation.

Installer scripts may pass through command-line arguments to `@okf-harness/setup` for advanced use, but README should not show parameterized script examples in the primary install path.

The primary Windows install command may use the concise PowerShell aliases `irm` and `iex`; advanced documentation can show the expanded `Invoke-RestMethod` and `Invoke-Expression` form with audit guidance.

For v0.6, `okf-harness.dev` should stay narrow: serve the two installer script URLs and redirect the root and documentation paths to the GitHub repository or docs. It should not introduce a separate landing page or website build.

The installer script source should live in the repository, while the latest short URLs should resolve to installer scripts attached to or generated from the latest GitHub Release so the recommended installer matches the latest public release rather than whatever is currently on `main`.

GitHub Releases should attach `install.sh` and `install.ps1` as release assets, and release verification should download those assets back before claiming the installer is published.
