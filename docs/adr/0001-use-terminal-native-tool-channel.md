# Use terminal-native tool channel by default

OKF Harness uses a terminal-native tool channel as the default way agent clients operate the harness: agents call local shell commands such as `okfh --json` instead of relying on a separate tool server. This keeps the system local, observable, easy to debug, and consistent across desktop and terminal agent clients while preserving natural-language interaction for users. Optional tool-discovery integrations can be evaluated later, but they are not part of the default product path.
