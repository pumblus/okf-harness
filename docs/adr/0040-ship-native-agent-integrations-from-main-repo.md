# Ship native agent integrations from the main repository

OKF Harness native agent integrations should be published from `pumblus/okf-harness` instead of a separate plugin marketplace repository. Keeping the marketplace manifests, plugin packages, shared templates, and runtime versioning in one repository reduces release coordination and keeps native integrations tied to the same product contract as `okfh`; split a dedicated marketplace repository only if host-specific marketplace formats start forcing independent release cadence.
