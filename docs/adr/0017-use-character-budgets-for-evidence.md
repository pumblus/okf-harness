# Use character budgets for evidence

Evidence briefs should be bounded by deterministic character budgets such as compact, standard, large, and explicit `--max-chars` overrides, not by model-specific token windows. OKF Harness cannot reliably know the agent client's hidden prompt, tool envelope, model tokenizer, or conversation history, so character budgets keep the output stable and testable without pretending to fill a model context window.

Budget presets may still include selection guidance: choose compact when either the model or agent client has a context window around 256k, standard around 400k, and large around 1M. These are human-readable guidance labels, not automatic token estimates or guarantees that the complete command output fits the available context.
