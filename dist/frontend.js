const CONNECTIONS_URL = '/api/v1/image-gen-connections'
const IMAGE_GEN_SETTINGS_URL = '/api/v1/settings/imageGeneration'
const GENERATE_URL = '/api/v1/image-gen/generate'
const PENDING_IMAGE_SETTINGS_PREFIX = '__lumiverse_pending_image_generation_patch'

const GENERATE_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
    <circle cx="9" cy="9" r="2"></circle>
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path>
    <path d="m14 19 1.2-1.2a2 2 0 0 1 2.8 0L21 21"></path>
  </svg>`

const SPINNER_ICON = `
  <svg class="ipi-spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.2-8.6"></path>
  </svg>`

async function readJson(url, options) {
  const response = await fetch(url, { credentials: 'include', ...options })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`)
  }
  return data
}

function requestBody(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Enter a JSON object.')
  }
  if (input.request_example?.body !== undefined) return requestBody(input.request_example.body)
  if (input.body !== undefined && Object.keys(input).length === 1) return requestBody(input.body)
  return input
}

export function setup(ctx) {
  const removeStyle = ctx.dom.addStyle(`
    .ipi-panel { padding: 16px; display: grid; gap: 12px; color: var(--lumiverse-text); }
    .ipi-panel label { display: grid; gap: 6px; }
    .ipi-panel select, .ipi-panel textarea {
      box-sizing: border-box; width: 100%; padding: 8px;
      border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill); color: var(--lumiverse-text);
      font: inherit;
    }
    .ipi-panel textarea { min-height: 260px; resize: vertical; font-family: monospace; }
    .ipi-panel .ipi-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .ipi-panel button { padding: 7px 11px; cursor: pointer; }
    .ipi-panel .ipi-note { color: var(--lumiverse-text-muted); font-size: 12px; line-height: 1.5; }
    .ipi-panel .ipi-status { min-height: 1.5em; font-size: 12px; }

    .ipi-action-root { display: contents; }
    .ipi-generate-button { order: 1; }
    .ipi-generate-button[aria-busy="true"] { color: var(--lumiverse-accent, #7c5cff) !important; }
    .ipi-generate-button.ipi-action-success { color: var(--lumiverse-success, #4caf72) !important; }
    .ipi-generate-button.ipi-action-error { color: var(--lumiverse-danger, #d44) !important; }
    .ipi-context-generate svg { flex: 0 0 auto; }
    .ipi-spin { animation: ipi-spin 800ms linear infinite; }
    @keyframes ipi-spin { to { transform: rotate(360deg); } }

    [data-component="BubbleActions"] > button:has(> svg.lucide-volume-2) ~ button,
    [data-component="BubbleActions"] > button:has(> svg.lucide-square) ~ button {
      order: 2;
    }
    [data-component="BubbleActions"]:not(:has(> button > svg.lucide-volume-2, > button > svg.lucide-square)) > button:nth-of-type(n+3) {
      order: 2;
    }

    .ipi-scene-background {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background-size: cover; background-position: center; background-repeat: no-repeat;
      transition-property: opacity; transition-timing-function: ease;
    }
    .ipi-scene-scrim {
      position: absolute; inset: 0; z-index: 1; pointer-events: none;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--lumiverse-scene-text-scrim) 88%, transparent) 0%,
          color-mix(in srgb, var(--lumiverse-scene-text-scrim) 48%, transparent) 24%,
          color-mix(in srgb, var(--lumiverse-scene-text-scrim) 26%, transparent) 52%,
          color-mix(in srgb, var(--lumiverse-scene-text-scrim) 82%, transparent) 100%
        ),
        radial-gradient(
          130% 95% at 50% 58%,
          transparent 40%,
          color-mix(in srgb, var(--lumiverse-scene-text-scrim) 35%, transparent) 100%
        );
      transition-property: opacity; transition-timing-function: ease;
    }

    .ipi-toast {
      position: fixed; left: 50%; bottom: 24px; z-index: 10000;
      max-width: min(420px, calc(100vw - 32px));
      padding: 9px 13px; border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-heavy);
      color: var(--lumiverse-text); box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
      font-size: 12px; line-height: 1.4; text-align: center;
      opacity: 0; pointer-events: none; transform: translate(-50%, 8px);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .ipi-toast.ipi-toast-visible { opacity: 1; transform: translate(-50%, 0); }
    .ipi-toast.ipi-toast-error { border-color: var(--lumiverse-danger, #d44); }
  `)

  const tab = ctx.ui.registerDrawerTab({
    id: 'image-payload-injector',
    title: 'Image Payload Injector',
    shortName: 'Payload',
    description: 'Edit NanoGPT image request JSON',
    keywords: ['image', 'nanogpt', 'payload', 'json'],
  })
  tab.root.innerHTML = `
    <div class="ipi-panel">
      <label> NanoGPT image connection <select data-ipi-connection></select> </label>
      <label> Request body override (JSON) <textarea data-ipi-json spellcheck="false" placeholder='{"showExplicitContent": true}'></textarea> </label>
      <div class="ipi-actions">
        <button type="button" data-ipi-save>Save override</button>
        <button type="button" data-ipi-clear>Clear override</button>
        <button type="button" data-ipi-refresh>Refresh connections</button>
      </div>
      <div class="ipi-note">Save applies to future generations from Lumiverse's image controls, message toolbar shortcut, and message right-click menu when this connection is selected. JSON is merged into the outgoing request body. Fields such as prompt or model may replace Lumiverse's values.</div>
      <div class="ipi-status" data-ipi-status role="status" aria-live="polite"></div>
    </div>
  `

  const select = tab.root.querySelector('[data-ipi-connection]')
  const editor = tab.root.querySelector('[data-ipi-json]')
  const status = tab.root.querySelector('[data-ipi-status]')
  const save = tab.root.querySelector('[data-ipi-save]')
  const clear = tab.root.querySelector('[data-ipi-clear]')
  const refresh = tab.root.querySelector('[data-ipi-refresh]')
  let connections = []
  let busy = false
  let disposed = false

  function message(value, error = false) {
    status.textContent = value
    status.style.color = error ? 'var(--lumiverse-danger, #d44)' : ''
  }

  function setBusy(value) {
    busy = value
    save.disabled = value
    clear.disabled = value
    refresh.disabled = value
    select.disabled = value
  }

  function showConnection() {
    const connection = connections.find(item => item.id === select.value)
    const stored = connection?.default_parameters?.rawRequestOverride
    if (typeof stored === 'string') {
      try { editor.value = JSON.stringify(JSON.parse(stored), null, 2) }
      catch { editor.value = stored }
    } else if (stored && typeof stored === 'object') {
      editor.value = JSON.stringify(stored, null, 2)
    } else {
      editor.value = ''
    }
    message(connection ? `Editing ${connection.name}` : 'No NanoGPT image connection found.')
  }

  async function loadConnections() {
    if (busy) return
    setBusy(true)
    message('Loading connections...')
    try {
      const result = await readJson(`${CONNECTIONS_URL}?limit=1000&offset=0`)
      if (disposed) return
      connections = (result.data || []).filter(item => item.provider === 'nanogpt')
      const previous = select.value
      select.replaceChildren()
      for (const connection of connections) {
        const option = document.createElement('option')
        option.value = connection.id
        option.textContent = connection.name
        select.append(option)
      }
      if (connections.some(item => item.id === previous)) select.value = previous
      else if (connections.some(item => item.is_default)) select.value = connections.find(item => item.is_default).id
      showConnection()
    } catch (error) {
      if (!disposed) message(error.message, true)
    } finally {
      if (!disposed) setBusy(false)
    }
  }

  async function writeOverride(remove) {
    if (busy || !select.value) return
    let body
    if (!remove) {
      try { body = requestBody(JSON.parse(editor.value)) }
      catch (error) { message(`Invalid JSON: ${error.message}`, true); return }
    }
    setBusy(true)
    message('Saving...')
    try {
      const id = encodeURIComponent(select.value)
      const current = await readJson(`${CONNECTIONS_URL}/${id}`)
      if (current.provider !== 'nanogpt') throw new Error('This is no longer a NanoGPT connection.')
      const parameters = { ...current.default_parameters }
      if (remove) delete parameters.rawRequestOverride
      else parameters.rawRequestOverride = JSON.stringify(body)
      const updated = await readJson(`${CONNECTIONS_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_parameters: parameters }),
      })
      if (disposed) return
      connections = connections.map(item => item.id === updated.id ? updated : item)
      if (remove) editor.value = ''
      message(remove ? 'Override cleared.' : 'Override saved. You can generate from Lumiverse or a message shortcut.')
    } catch (error) {
      if (!disposed) message(error.message, true)
    } finally {
      if (!disposed) setBusy(false)
    }
  }

  select.addEventListener('change', showConnection)
  save.addEventListener('click', () => writeOverride(false))
  clear.addEventListener('click', () => writeOverride(true))
  refresh.addEventListener('click', loadConnections)
  loadConnections()

  const toastWrapper = ctx.dom.inject('body', '<div class="ipi-toast" role="status" aria-live="polite"></div>')
  const toast = toastWrapper.querySelector('.ipi-toast')
  const actionWrappers = new Map()
  const actionButtons = new Set()
  let toastTimer = null
  let scanFrame = null
  let generating = false
  let activeGenerationButton = null
  let generationTimeout = null
  let generationController = null
  let previewModal = null
  let generatedBackground = null
  let backgroundLayer = null
  let backgroundScrim = null

  function showToast(text, error = false) {
    if (!toast) return
    toast.textContent = text
    toast.classList.toggle('ipi-toast-error', error)
    toast.classList.add('ipi-toast-visible')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('ipi-toast-visible'), error ? 6500 : 3500)
  }

  function currentChatId() {
    const match = window.location.pathname.match(/\/chat\/([^/?#]+)/)
    if (!match) return null
    try { return decodeURIComponent(match[1]) }
    catch { return match[1] }
  }

  function setGenerationState(activeButton, state) {
    for (const button of actionButtons) button.disabled = state === 'busy'
    for (const button of document.querySelectorAll('.ipi-context-generate')) button.disabled = state === 'busy'
    if (!activeButton) return

    activeButton.classList.remove('ipi-action-success', 'ipi-action-error')
    activeButton.removeAttribute('aria-busy')
    activeButton.innerHTML = GENERATE_ICON
    activeButton.title = 'Generate image'
    activeButton.setAttribute('aria-label', 'Generate image')

    if (state === 'busy') {
      activeButton.innerHTML = SPINNER_ICON
      activeButton.title = 'Generating image...'
      activeButton.setAttribute('aria-label', 'Generating image')
      activeButton.setAttribute('aria-busy', 'true')
    } else if (state === 'success') {
      activeButton.classList.add('ipi-action-success')
      activeButton.title = 'Image generated'
    } else if (state === 'error') {
      activeButton.classList.add('ipi-action-error')
    }
  }

  function finishGeneration(state = 'idle', notice = '', error = false) {
    if (!generating) return
    generating = false
    if (generationTimeout) clearTimeout(generationTimeout)
    generationTimeout = null
    generationController = null

    const button = activeGenerationButton
    activeGenerationButton = null
    if (button) {
      setGenerationState(button, state)
      setTimeout(() => {
        if (!generating) setGenerationState(button, 'idle')
      }, 1800)
    }
    for (const actionButton of actionButtons) actionButton.disabled = false
    for (const button of document.querySelectorAll('.ipi-context-generate')) button.disabled = false
    if (notice) showToast(notice, error)
  }

  function showGeneratedImage(result) {
    const src = result?.imageDataUrl || result?.imageUrl
    if (!src || typeof ctx.ui.showModal !== 'function') return

    if (previewModal) previewModal.dismiss()
    previewModal = ctx.ui.showModal({ title: 'Generated image', width: 720, maxHeight: 820 })
    const image = document.createElement('img')
    image.src = src
    image.alt = 'Generated image'
    image.style.cssText = 'display:block;width:100%;height:auto;max-height:720px;object-fit:contain;border-radius:var(--lumiverse-radius);'
    previewModal.root.append(image)
    previewModal.onDismiss(() => { previewModal = null })
  }

  function removeGeneratedBackground() {
    backgroundLayer?.remove()
    backgroundScrim?.remove()
    backgroundLayer = null
    backgroundScrim = null
  }

  function mountGeneratedBackground() {
    if (!generatedBackground) return
    const chatView = document.querySelector('[data-component="ChatView"]')
    if (!chatView) return
    if (backgroundLayer?.parentElement === chatView && backgroundScrim?.parentElement === chatView) return

    removeGeneratedBackground()
    backgroundLayer = document.createElement('div')
    backgroundLayer.className = 'ipi-scene-background'
    backgroundLayer.style.backgroundImage = 'url("' + generatedBackground.src.replaceAll('"', '%22') + '")'
    backgroundLayer.style.opacity = String(generatedBackground.opacity)
    backgroundLayer.style.transitionDuration = generatedBackground.transitionMs + 'ms'

    backgroundScrim = document.createElement('div')
    backgroundScrim.className = 'ipi-scene-scrim'
    backgroundScrim.style.opacity = '1'
    backgroundScrim.style.transitionDuration = generatedBackground.transitionMs + 'ms'

    chatView.append(backgroundLayer, backgroundScrim)
  }

  function applyGeneratedBackground(result, settings) {
    const src = result?.imageDataUrl || result?.imageUrl
    if (!src) throw new Error('Lumiverse did not return an image for the background.')

    const rawOpacity = Number(settings.backgroundOpacity)
    const rawTransition = Number(settings.fadeTransitionMs)
    generatedBackground = {
      src,
      opacity: Number.isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 0.35,
      transitionMs: Number.isFinite(rawTransition) ? Math.max(100, rawTransition) : 800,
    }
    mountGeneratedBackground()
  }

  function getPendingImageGenerationSettings() {
    try {
      const matches = []
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (key !== PENDING_IMAGE_SETTINGS_PREFIX && !key?.startsWith(PENDING_IMAGE_SETTINGS_PREFIX + ':')) continue
        const value = JSON.parse(localStorage.getItem(key) || '{}')
        if (value && typeof value === 'object' && !Array.isArray(value)) matches.push(value)
      }
      return matches.length === 1 ? matches[0] : {}
    } catch {
      return {}
    }
  }

  async function getImageGenerationSettings() {
    let value = {}
    try {
      const row = await readJson(IMAGE_GEN_SETTINGS_URL)
      value = row?.value
      if (typeof value === 'string') {
        try { value = JSON.parse(value) }
        catch { value = {} }
      }
    } catch {
      value = {}
    }
    const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return { ...saved, ...getPendingImageGenerationSettings() }
  }

  async function getLastMessageId(chatId) {
    const encodedChatId = encodeURIComponent(chatId)
    const result = await readJson('/api/v1/chats/' + encodedChatId + '/messages?tail=true&limit=1')
    const lastMessage = Array.isArray(result?.data) ? result.data[result.data.length - 1] : null
    if (!lastMessage?.id) throw new Error('There is no message to attach the image to.')
    return lastMessage.id
  }

  // The extension worker API forces preview output; this is the same route used by ImageGenPanel.
  async function generateFromMessage(button) {
    if (generating) return
    const chatId = currentChatId()
    if (!chatId) {
      showToast('Open a chat before generating an image.', true)
      return
    }

    generating = true
    activeGenerationButton = button
    setGenerationState(button, 'busy')
    showToast('Image generation started.')

    const controller = new AbortController()
    generationController = controller
    generationTimeout = setTimeout(() => controller.abort(), 10 * 60 * 1000)

    try {
      const settings = await getImageGenerationSettings()
      const allowedTargets = new Set(['background', 'chat_attachment', 'attach_to_message', 'preview'])
      const outputTarget = allowedTargets.has(settings.outputTarget) ? settings.outputTarget : 'background'
      const attachToMessageId = outputTarget === 'attach_to_message'
        ? await getLastMessageId(chatId)
        : undefined

      const result = await readJson(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          forceGeneration: false,
          promptMode: settings.promptMode,
          prompt: settings.customPrompt,
          negativePrompt: settings.customNegativePrompt,
          promptPresetId: settings.activePromptPresetId ?? null,
          outputTarget,
          bypassCharacterLora: !!settings.bypassCharacterLora,
          bypassActiveLoraPreset: !!settings.bypassActiveLoraPreset,
          loraStrengthScale: settings.loraStrengthScale,
          attachToMessageId,
          clientJobId: crypto.randomUUID(),
          promptGenerationTimeoutSeconds: settings.promptGenerationTimeoutSeconds,
          generationTimeoutSeconds: settings.generationTimeoutSeconds,
        }),
      })

      if (!result?.generated) {
        finishGeneration('error', result?.reason || 'Lumiverse did not generate an image.', true)
        return
      }

      if (outputTarget === 'background') {
        applyGeneratedBackground(result, settings)
        finishGeneration('success', 'Image set as the chat background.')
      } else if (outputTarget === 'preview') {
        showGeneratedImage(result)
        finishGeneration('success', 'Image generated for preview.')
      } else if (outputTarget === 'chat_attachment') {
        finishGeneration('success', 'Image inserted into the chat.')
      } else {
        finishGeneration('success', 'Image attached to the last message.')
      }
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      const detail = timedOut
        ? 'Image generation timed out.'
        : error instanceof Error ? error.message : String(error)
      finishGeneration('error', detail, true)
    }
  }

  function installContextMenuAction() {
    for (const pencilIcon of document.querySelectorAll('svg.lucide-pencil')) {
      const editButton = pencilIcon.closest('button')
      const menu = editButton?.parentElement
      if (!editButton || !menu || getComputedStyle(menu).position !== 'fixed') continue
      if (menu.querySelector(':scope > .ipi-context-generate')) continue

      const buttons = Array.from(menu.children).filter(element => element.tagName === 'BUTTON')
      const editIndex = buttons.indexOf(editButton)
      const copyButton = buttons[editIndex - 1]
      if (editIndex < 1 || !copyButton?.querySelector('svg.lucide-copy')) continue

      const ttsButton = buttons.slice(editIndex + 1).find(button => (
        button.querySelector('svg.lucide-volume-2, svg.lucide-square')
      ))
      const insertionPoint = ttsButton || buttons[editIndex + 1]
      if (!insertionPoint) continue

      const button = editButton.cloneNode(false)
      button.classList.add('ipi-context-generate')
      button.disabled = generating
      button.innerHTML = GENERATE_ICON.replace('width="13" height="13"', 'width="14" height="14"') + '<span>Generate image</span>'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
        generateFromMessage(null)
      })
      insertionPoint.before(button)
    }
  }

  function installMessageAction(messageId, messageElement) {
    const speakerIcon = messageElement.querySelector('svg.lucide-volume-2, svg.lucide-square')
    const toolbar = messageElement.querySelector('[data-component="BubbleActions"]') || speakerIcon?.closest('div')
    if (!toolbar) return

    const existing = actionWrappers.get(messageId)
    const mount = toolbar.querySelector('[data-spindle-mount="message_actions"]')
    const speakerButton = speakerIcon?.closest('button')
    const target = mount || speakerButton
    if (!target) return

    if (existing) {
      if (!toolbar.contains(existing)) {
        if (mount) mount.insertAdjacentElement('beforebegin', existing)
        else speakerButton.insertAdjacentElement('afterend', existing)
      }
      return
    }

    const wrapper = ctx.dom.inject(
      target,
      `<button type="button" class="ipi-generate-button" title="Generate image" aria-label="Generate image">${GENERATE_ICON}</button>`,
      mount ? 'beforebegin' : 'afterend',
    )
    wrapper.classList.add('ipi-action-root')
    const button = wrapper.querySelector('.ipi-generate-button')
    if (!button) return

    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      generateFromMessage(button)
    })
    actionWrappers.set(messageId, wrapper)
    actionButtons.add(button)
  }

  function scanMessageActions() {
    scanFrame = null
    mountGeneratedBackground()
    installContextMenuAction()
    const messages = typeof ctx.dom.listMessageElements === 'function'
      ? ctx.dom.listMessageElements()
      : []
    for (const { messageId, element } of messages) {
      installMessageAction(messageId, element)
    }
  }

  function scheduleScan() {
    if (scanFrame !== null) return
    scanFrame = requestAnimationFrame(scanMessageActions)
  }

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleScan()

  const unsubscribeChatSwitched = ctx.events?.on?.('CHAT_SWITCHED', scheduleScan)
  const unsubscribeImageProgress = ctx.events?.on?.('IMAGE_GEN_PROGRESS', (payload) => {
    if (!generating || !activeGenerationButton || (payload?.chatId && payload.chatId !== currentChatId())) return
    const step = Number(payload?.step)
    const total = Number(payload?.totalSteps)
    if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
      activeGenerationButton.title = 'Generating image... ' + step + '/' + total
    }
  })

  return () => {
    disposed = true
    observer.disconnect()
    if (scanFrame !== null) cancelAnimationFrame(scanFrame)
    if (toastTimer) clearTimeout(toastTimer)
    if (generationTimeout) clearTimeout(generationTimeout)
    generationController?.abort()
    if (previewModal) previewModal.dismiss()
    removeGeneratedBackground()
    if (typeof unsubscribeChatSwitched === 'function') unsubscribeChatSwitched()
    if (typeof unsubscribeImageProgress === 'function') unsubscribeImageProgress()
    actionWrappers.clear()
    actionButtons.clear()
    tab.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
