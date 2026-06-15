# Use terminal-native tool channel for v0.1

OKF Harness v0.1 uses a terminal-native tool channel as the default way agent clients operate the harness: agents call local shell commands such as `okfh --json` instead of relying on an MCP server. This keeps the system local, observable, easy to debug, and consistent across desktop and terminal agent clients while preserving natural-language interaction for users. MCP can remain a future optional integration, but it is not part of the default v0.1 product path.
