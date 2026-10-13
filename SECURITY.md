# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub's [private vulnerability reporting](https://github.com/andrebrito16/calendblade/security/advisories/new) for this repository ([how it works](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)). Only the maintainers can see the report.

Include steps to reproduce, the affected version or commit, and the impact you observed. We are happy to credit you in the release notes.

## Response targets

| Stage | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Initial assessment | within 7 days |
| Fix for critical issues | within 14 days |
| Fix for other issues | next regular release |

## Supported versions

Only the latest commit on `main` (and the latest release, once releases are tagged) receives security fixes. Self-hosters should stay up to date.

## Areas of particular interest

- **OAuth tokens**: Google access/refresh tokens are encrypted at rest (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) and must never reach the browser, logs or error reports.
- **Calendar connection flow**: the OAuth `state` is a signed, short-lived JWT bound to a nonce cookie.
- **Webhooks**: `/api/webhooks/google` must only accept notifications whose channel token matches the HMAC derived from `WEBHOOK_SECRET`.
- **Cron endpoints**: `/api/cron/*` must reject requests without `Authorization: Bearer <CRON_SECRET>`.
- **Authorization**: every Server Action and route handler must check the session and resource ownership.
- **Cross-account data leaks**: a user must never read or write another user's connections, calendars, rules or runs.

Out of scope: denial of service through volume, issues requiring a compromised device or Google account, and findings in third-party services we integrate with (report those to the vendor).
