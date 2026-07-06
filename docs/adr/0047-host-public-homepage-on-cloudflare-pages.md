# Host the public homepage on Cloudflare Pages

The first OKF Harness public homepage should be a static HTML page served by Cloudflare Pages, with `_redirects` preserving installer and documentation routes. This keeps the site deployable without a JavaScript app framework while matching the current Cloudflare-hosted `okf-harness.dev` domain and preserving short installer URLs.

## Rollout checklist

1. Run `pnpm site:check` and deploy `site/dist` from the checked commit to a Cloudflare Pages preview.
2. Before binding `okf-harness.dev`, verify the preview root serves the homepage and these routes keep their redirect contract: `/install.sh`, `/install.ps1`, `/docs`, `/docs/*`, `/llms.txt`, and `/llms-full.txt`.
3. Before binding production, manually check mobile and desktop widths for horizontal overflow, placeholder text, fake assets, and pricing language.
4. Bind the production domain only after preview verification passes.
5. After binding production, rerun the same HTTP and manual checks against `https://okf-harness.dev/` and record the preview URL plus production output on the rollout issue.

## Rollback

If the homepage needs to be rolled back, add this root-only redirect above the existing rules and redeploy the same Pages project:

```text
/ https://github.com/pumblus/okf-harness 302
```

Keep the installer, docs, and LLM context redirects unchanged. After rollback, verify `/install.sh` and `/install.ps1` still resolve to the latest GitHub Release assets.
