/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock core before importing the module
jest.unstable_mockModule('@actions/core', () => core)

// Mock lark utilities
const sendLarkWebhook = jest.fn(async () => ({
  ok: true,
  status: 200,
  text: async () => 'ok'
}))
const buildBodyFromTemplate = jest.fn((t: string) => ({
  body: JSON.parse(t),
  interpolated: t
}))

jest.unstable_mockModule('../src/lark.js', () => ({
  sendLarkWebhook,
  buildBodyFromTemplate
}))

const { run } = await import('../src/main.js')

describe('main.ts', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('dry_run prints interpolated JSON and sets outputs', async () => {
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'webhook_url':
          return 'https://example'
        case 'message_template':
          return '{"msg_type":"text","content":{"text":"Hello"}}'
        case 'variables':
          return ''
        case 'request_timeout_ms':
          return '1000'
        default:
          return ''
      }
    })
    core.getBooleanInput.mockImplementation((name: string) => {
      if (name === 'dry_run') return true
      if (name === 'fail_on_http_error') return true
      return false
    })

    await run()

    expect(core.info).toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('ok', true)
    expect(core.setOutput).toHaveBeenCalledWith('status', 0)
    expect(core.setOutput).toHaveBeenCalledWith('response_text', 'dry_run')
    expect(sendLarkWebhook).not.toHaveBeenCalled()
  })

  it('sends webhook without failing', async () => {
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'webhook_url':
          return 'https://example'
        case 'message_template':
          return '{"msg_type":"text","content":{"text":"Hello"}}'
        case 'variables':
          return ''
        case 'request_timeout_ms':
          return '1000'
        default:
          return ''
      }
    })
    core.getBooleanInput.mockImplementation(() => false)

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
  })
})
