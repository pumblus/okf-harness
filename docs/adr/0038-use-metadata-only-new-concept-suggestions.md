# Use metadata-only new concept suggestions in ingest plans

Ingest plans may suggest one new Topic concept path when registered source metadata does not clearly match existing content concepts, but the CLI should not create that file or infer the source's semantic topic from the raw body. Candidate concepts remain an ordered list of existing non-reference content pages with mechanical match reasons; the suggested new concept is a handoff prompt for an agent or person to confirm after reading the source, not an automatic wiki synthesis step or confidence claim.
