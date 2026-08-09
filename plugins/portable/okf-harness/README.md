# OKF Harness

Turn the material you already have — notes, papers, exports, transcripts — into a knowledge wiki your agent can maintain and answer from, with every answer pointing back at the source it came from.

This is the portable [Agent Plugin](https://agent-plugins.org/) build. It carries one skill and works in any agent client that loads Agent Skills.

## What you get

Ask your agent, in plain language, to:

- **Start a wiki** — "set up an OKF workspace for my reading notes"
- **Find the one you already have** — "open my OKF workspace"
- **Feed it** — "add this PDF and write it up"
- **Keep it honest** — "check my workspace"
- **Update it when the source changes** — "this is the v2 of that report, reconcile it"
- **Ask it things** — "what do my sources say about X?" (answers cite concepts and source IDs)
- **See its shape** — "graph my wiki"

You do not choose a mode or memorize commands. You say what you want; the skill picks the route.

## Before you install

- A **shell** the agent can run commands in.
- **Node.js 22+** with `npx` on your PATH.

The Harness itself is fetched on first use — nothing else to install by hand.

## Install

The plugin **is** the folder `plugins/portable/okf-harness/` inside [the OKF Harness repository](https://github.com/pumblus/okf-harness). Every install is the same idea: get that folder onto your machine, then point your client at it.

Get the folder:

```bash
git clone https://github.com/pumblus/okf-harness ~/okf-harness-plugin
# the plugin lives at ~/okf-harness-plugin/plugins/portable/okf-harness
```

Then, for your client:

**Cursor** — copy it into the local plugin folder and restart Cursor:

```bash
mkdir -p ~/.cursor/plugins/local
cp -R ~/okf-harness-plugin/plugins/portable/okf-harness ~/.cursor/plugins/local/okf-harness
```

**Copilot CLI** — install from the local path:

```bash
copilot plugin install ~/okf-harness-plugin/plugins/portable/okf-harness
```

**Codex CLI** — requires v0.147.0 or later, which added portable Agent Plugins:

```bash
codex plugin marketplace add ~/okf-harness-plugin
codex plugin list
```

**Kiro** — Powers panel → *Add Custom Power* → import from a local folder, and choose the folder above.

**Anything else** — if your client reads Agent Plugins, hand it this folder. If it reads Agent Skills only, copy `skills/okf-harness/` into its skills folder.

## Check that it worked

Start a new session and ask:

> Set up an OKF Harness workspace for my notes.

The agent should reach for the **okf-harness** skill and start by resolving a workspace. If it does not, the plugin is not loaded — see your client's plugin list.

## Uninstall

Remove the plugin through your client, or delete the copied directory. Your workspaces are ordinary folders on disk and are untouched.

## Licence

Apache-2.0. Issues and questions: https://github.com/pumblus/okf-harness/issues
