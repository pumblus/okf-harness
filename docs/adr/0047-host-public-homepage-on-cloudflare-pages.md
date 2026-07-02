# Host the public homepage on Cloudflare Pages

The first OKF Harness public homepage should be a static HTML page served by Cloudflare Pages, with `_redirects` preserving installer and documentation routes. This keeps the site deployable without a JavaScript app framework while matching the current Cloudflare-hosted `okf-harness.dev` domain and preserving short installer URLs.
