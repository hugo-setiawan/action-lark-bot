# Lark Webhook Notifier (GitHub Action)

[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

Send customizable messages to Lark group chats via Bot Webhooks.
Build your JSON payloads with Handlebars templates, interpolate variables from
your workflow, and optionally sign requests with a webhook secret.

• Handlebars templating, with JSON-safe helpers • Variables from JSON or
key=value lines • Optional signature verification (timestamp + sign) • Dry-run
mode for safe previews

## Quick start

Add a step to your workflow:

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Send Lark message
        uses: hugo-setiawan/action-lark-bot@v1
        with:
          webhook_url: ${{ secrets.LARK_WEBHOOK_URL }}
          # Optional: enable signature verification
          # webhook_secret: ${{ secrets.LARK_WEBHOOK_SECRET }}
          message_template: |
            {
              "msg_type": "text",
              "content": { "text": "Hello {{name}}" }
            }
          variables: |
            name=World
```

## Inputs

- webhook_url (required): Lark Incoming Webhook URL
- message_template (required): JSON payload template rendered with Handlebars
- variables (optional): Variables for the template. Supported formats:
  - JSON object on a single line or multi-line string
  - Newline-separated key=value (or key: value) pairs; lines starting with `#`
    are ignored
  - Types auto-coerced: true/false/null, numbers, JSON, otherwise string
- request_timeout_ms (optional, default 10000): HTTP timeout in ms
- dry_run (optional, default false): If true, prints the interpolated JSON and
  skips the HTTP call
- fail_on_http_error (optional, default true): If true, mark the step failed
  when HTTP status is not 2xx
- webhook_secret (optional): If set, the action adds `timestamp` (as string,
  seconds) and `sign` fields to the body per Lark's signature verification

## Outputs

- ok: boolean, true for 2xx responses
- status: number, HTTP status code
- response_text: string, raw response body

## Templating with Handlebars

This action exclusively uses Handlebars to render `message_template`.

Registered helpers for JSON-safe rendering:

- {{json var}}: injects a JSON value unquoted. Use outside quotes.
- {{jstr var}}: injects a JSON string content. Use inside quotes.

Examples:

1. Inject string inside quotes

```jsonc
{
  "msg_type": "text",
  "content": { "text": "Build {{jstr status}} for {{jstr repo}}" }
}
```

2. Inject object without quotes

```jsonc
{
  "msg_type": "post",
  "content": {
    "post": {
      "zh_cn": {
        "title": "Report",
        "content": {{json body}}
      }
    }
  }
}
```

Where `variables` could be:

```yaml
variables: |
  status=SUCCESS
  repo=${{ github.repository }}
  body=[[{"tag":"text","text":"Line 1"}]]
```

Important: After rendering, the template must be valid JSON. If not, the action
fails with a helpful error that includes the interpolated content for debugging.

## Signature verification (optional)

If you enable signature verification for your custom bot, set `webhook_secret`.
The action will:

Notes:

- The top-level `message_template` must be a JSON object (not an array) so we
  can add `timestamp` and `sign`.

## Variables input formats

You can pass variables in two ways:

1. JSON object (preferred for complex structures)

```yaml
variables: '{"name":"World","nested":{"n":1},"arr":[1,2,3]}'
```

2. Key/value lines (convenient in YAML)

```yaml
variables: |
  # Comments are ignored
  name=World
  n=42
  flag=true
  data={"a":1}
```

Type coercion rules:

- true, false, null → booleans/null
- Numeric strings like 123 or -4.5 → numbers
- JSON-looking strings → parsed as JSON
- Otherwise → plain strings

## Examples

1. Text message with variables and dry-run

```yaml
- name: Preview Lark message
  uses: hugo-setiawan/action-lark-bot@v1
  with:
    webhook_url: ${{ secrets.LARK_WEBHOOK_URL }}
    message_template: |
      { "msg_type": "text", "content": { "text": "Hello {{jstr who}}" } }
    variables: '"who":"CI"' # invalid JSON on purpose; instead use JSON object or key=value lines
    dry_run: true
```

Correct way for variables above:

```yaml
variables: '{"who":"CI"}'
# or
variables: |
  who=CI
```

2. Enable signature verification

```yaml
- name: Send signed message
  uses: hugo-setiawan/action-lark-bot@v1
  with:
    webhook_url: ${{ secrets.LARK_WEBHOOK_URL }}
    webhook_secret: ${{ secrets.LARK_WEBHOOK_SECRET }}
    message_template: |
      { "msg_type": "text", "content": { "text": "Signed {{jstr msg}}" } }
    variables: |
      msg=hello
```

## Troubleshooting

- Interpolated JSON is invalid
  - Use the provided helpers correctly: `{{jstr var}}` inside quotes,
    `{{json var}}` outside.
  - Enable `dry_run: true` to print the interpolated JSON and inspect it.
- Non-2xx response from Lark (ok=false)
  - Check the response_text for error details (e.g., rate limiting, bad
    payload).
  - Ensure your message type and fields match Lark/Feishu specs.
- Signature verification failed (code 19021)
  - Check that your server time is correct; timestamp must be within 1 hour.
  - Ensure you used the correct secret and didn’t modify timestamp/sign fields.

## Development

Requirements: Node.js >= 24

Install, test, and bundle:

```bash
npm install
npm run test
npm run bundle
```

Notes:

- Source is in `src/`, bundled code in `dist/`.
- After making changes under `src/`, run `npm run bundle` to update `dist/`.
- Lint: `npm run lint`.
- Local run (optional): `npx @github/local-action . src/main.ts .env` (see
  `.env.example`).

## Versioning & Releases

- Bump `package.json` version per SemVer when changing behavior.
- Use the helper `script/release` to tag versions and update major aliases.
- Keep `dist/` up to date; CI checks the generated code.

## License

MIT
