// Utilities to build and send Lark webhook messages with Handlebars templating.
import Handlebars from 'handlebars'

type Primitive = string | number | boolean | null
type JSONValue = Primitive | JSONObject | JSONArray
interface JSONObject {
  [key: string]: JSONValue
}
type JSONArray = JSONValue[]

export interface BuildResult {
  body: JSONValue
  interpolated: string
}

export interface SendOptions {
  timeoutMs?: number
}

function coerceValue(raw: string): JSONValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (!Number.isNaN(Number(raw)) && /^-?\d+(?:\.\d+)?$/.test(raw)) {
    return Number(raw)
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Parse variables from a string input. Supports:
 * - JSON objects (preferred)
 * - newline-separated key=value or key: value pairs
 */
export function parseVariables(input?: string): Record<string, JSONValue> {
  if (!input || input.trim() === '') return {}

  // Try JSON first
  try {
    const obj = JSON.parse(input) as unknown
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, JSONValue>
    }
  } catch {
    // continue to kv parsing
  }

  const vars: Record<string, JSONValue> = {}
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  const re = /^(.*?)\s*([=:])\s*(.*)$/
  for (const line of lines) {
    const m = re.exec(line)
    if (!m) continue
    const key = m[1].trim()
    const raw = m[3].trim()
    vars[key] = coerceValue(raw)
  }
  return vars
}

// Built-in helpers removed; Handlebars is the sole templating engine.

/**
 * Interpolates a JSON template using {{var}} placeholders.
 * - Supports dot paths (e.g., {{ user.name }})
 * - Handles quoted vs unquoted contexts to keep JSON valid
 * - Unknown variables become empty strings
 */
// Note: All templating is handled via Handlebars.templating e

/** Builds a JSON body from a template and variables input string. */
export function buildBodyFromTemplate(
  template: string,
  variablesInput?: string
): BuildResult {
  const vars = parseVariables(variablesInput)
  // Create isolated Handlebars instance and register JSON-safe helpers
  const h = Handlebars.create()
  h.registerHelper(
    'json',
    (v: unknown) => new h.SafeString(JSON.stringify(v as JSONValue))
  )
  h.registerHelper(
    'jstr',
    (v: unknown) =>
      new h.SafeString(JSON.stringify(v as JSONValue).slice(1, -1))
  )
  // noEscape avoids HTML entity escaping which corrupts JSON; rely on helpers instead
  const compiled = h.compile(template, { noEscape: true })
  const interpolated = compiled(vars)
  let body: JSONValue
  try {
    body = JSON.parse(interpolated) as JSONValue
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Interpolated message_template is not valid JSON. Error: ${msg}. Content: ${interpolated}`
    )
  }
  return { body, interpolated }
}

async function generateLarkWebhookSignature(
  webhookKey: string,
  timestamp: number
) {
  // Per Lark/Feishu docs: use `${timestamp}\n${secret}` as the HMAC key,
  // compute HMAC-SHA256 over an empty string, then base64 encode the result.
  const { createHmac } = await import('node:crypto')
  const key = `${timestamp}\n${webhookKey}`
  const h = createHmac('sha256', key)
  h.update('')
  return h.digest('base64')
}

/** Sends a POST request to a Lark webhook URL with a JSON body. */
export async function sendLarkWebhook(
  webhookUrl: string,
  webhookKey: string | undefined,
  body: JSONValue,
  opts: SendOptions = {}
) {
  const requestTimestamp = Math.floor(Date.now() / 1000)
  let signedBody: JSONValue = body
  if (webhookKey && webhookKey.trim() !== '') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(
        'Signing requires the message_template to be a JSON object to add timestamp and sign fields.'
      )
    }
    const sign = await generateLarkWebhookSignature(
      webhookKey,
      requestTimestamp
    )
    // Lark expects timestamp as string and sign fields at top-level of body
    signedBody = {
      ...body,
      timestamp: String(requestTimestamp),
      sign
    }
  }

  const controller = new AbortController()
  const timeout = opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined
  try {
    console.log(JSON.stringify(signedBody))
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(signedBody),
      signal: controller.signal
    })
    return res
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
