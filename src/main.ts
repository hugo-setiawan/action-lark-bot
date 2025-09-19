import * as core from '@actions/core'
import { buildBodyFromTemplate, sendLarkWebhook } from './lark.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const webhookUrl = core.getInput('webhook_url', { required: true })
    const webhookSecret = core.getInput('webhook_secret')
    const template = core.getInput('message_template', { required: true })
    const variablesInput = core.getInput('variables')
    const dryRun = core.getBooleanInput('dry_run')
    const timeoutMsInput = core.getInput('request_timeout_ms')
    const failOnHttpError = core.getBooleanInput('fail_on_http_error')

    const timeoutMs = timeoutMsInput ? parseInt(timeoutMsInput, 10) : undefined

    core.debug('Building Lark message body from template and variables')
    const { body, interpolated } = buildBodyFromTemplate(
      template,
      variablesInput
    )

    if (dryRun) {
      core.info('[dry_run] Skipping webhook call. Interpolated JSON:')
      core.info(interpolated)
      core.setOutput('ok', true)
      core.setOutput('status', 0)
      core.setOutput('response_text', 'dry_run')
      return
    }

    core.debug('Sending Lark webhook request')
    const res = await sendLarkWebhook(webhookUrl, webhookSecret, body, {
      timeoutMs
    })
    const text = await res.text()
    const ok = res.ok
    const status = res.status

    // Expose outputs
    core.setOutput('ok', ok)
    core.setOutput('status', status)
    core.setOutput('response_text', text)

    if (!ok && failOnHttpError) {
      core.setFailed(`Lark webhook failed with status ${status}: ${text}`)
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
