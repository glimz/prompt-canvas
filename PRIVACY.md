# Privacy Policy (Demo)

Last updated: 2026-03-09

This repository is a demo application for generating blog header images with AI providers.

## What data is processed
- Authentication data from Supabase access tokens.
- User email and user ID for authorization and audit logs.
- Request metadata (IP address, user-agent, timestamps).
- Blog titles submitted for image generation.
- Generated prompts and output metadata (manifest records).

## Where data is stored
- Local server files under `output/`:
- `output/audit-log.jsonl`
- `output/manifest.json`
- `output/images/*`
- Environment configuration in local `.env` files (not committed).

## Third-party services
- Supabase for authentication.
- OpenAI and/or Pollinations for image generation.
- Discord webhook notifications (optional), if enabled.
- Cloudflare Tunnel for public ingress (optional).

## Logging and monitoring
- Backend endpoints write operational and audit logs.
- Admin users can view logs from the admin dashboard.

## Secrets and keys
- API keys and secrets must stay in backend `.env` only.
- Frontend env files must never contain private keys.

## Public demo notice
- Do not include client names, private brands, or confidential identifiers in committed code, defaults, screenshots, or logs.
- Use neutral placeholders in public repositories.

## Data removal
- To clear local generated data:
- delete files under `output/images/`
- remove `output/manifest.json` and `output/audit-log.jsonl`

## Contact
- For production or legal-grade privacy requirements, replace this demo policy with your organization's official privacy policy.
