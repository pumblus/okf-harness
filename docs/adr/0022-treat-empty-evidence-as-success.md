# Treat empty evidence as success

`okfh evidence "<question>" --json` should exit successfully when the workspace is readable but no candidate concepts are found. Empty evidence is a query outcome, not a tool failure; the JSON should expose an empty evidence list and a mechanical limit such as no matches so the agent can explain that the synthesized wiki does not currently cover the question.
