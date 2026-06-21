# Use item numbers, not confidence scores

Evidence briefs should identify evidence items and candidate concepts with stable `item` numbers rather than public confidence, relevance, or ranking scores. OKF Harness may use deterministic ordering internally, but the JSON contract should not expose a number that agents or people could mistake for semantic confidence or truth quality.
