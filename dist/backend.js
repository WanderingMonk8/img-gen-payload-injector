const GENERATE_REQUEST = 'image_payload_injector_generate'
const GENERATE_RESULT = 'image_payload_injector_generate_result'

spindle.onFrontendMessage(async (payload, userId) => {
  if (payload?.type !== GENERATE_REQUEST) return

  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  const chatId = typeof payload.chatId === 'string' ? payload.chatId.trim() : ''

  if (!requestId || !chatId) {
    spindle.sendToFrontend({
      type: GENERATE_RESULT,
      requestId,
      error: 'A chat is required for image generation.',
    }, userId)
    return
  }

  try {
    if (typeof spindle.imageGen?.generateNative !== 'function') {
      throw new Error('This Lumiverse version does not support native image generation from extensions.')
    }

    const result = await spindle.imageGen.generateNative({
      chat_id: chatId,
      forceGeneration: false,
      includeDataUrl: true,
      clientJobId: typeof payload.clientJobId === 'string' ? payload.clientJobId : undefined,
      userId,
    })

    spindle.sendToFrontend({
      type: GENERATE_RESULT,
      requestId,
      result,
    }, userId)
  } catch (error) {
    spindle.sendToFrontend({
      type: GENERATE_RESULT,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }, userId)
  }
})
