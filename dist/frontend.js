const CONNECTIONS_URL = '/api/v1/image-gen-connections'
const GENERATE_URL = '/api/v1/image-gen/generate'

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
    .ipi-spin { animation: ipi-spin 800ms linear infinite; }
    @keyframes ipi-spin { to { transform: rotate(360deg); } }

    [data-component="BubbleActions"] > button:has(> svg.lucide-volume-2) ~ button,
    [data-component="BubbleActions"] > button:has(> svg.lucide-square) ~ button {
      order: 2;
    }
    [data-component="BubbleActions"]:not(:has(> button > svg.lucide-volume-2, > button > svg.lucide-square)) > button:nth-of-type(n+3) {
      order: 2;
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
      <div class="ipi-note">Save applies to future generations from Lumiverse's image controls and the message toolbar shortcut when this connection is selected. JSON is merged into the outgoing request body. Fields such as prompt or model may replace Lumiverse's values.</div>
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
      message(remove ? 'Override cleared.' : 'Override saved. You can generate from Lumiverse or a message toolbar.')
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

  async function generateFromMessage(messageId, button) {
    if (generating) return
    const chatId = currentChatId()
    if (!chatId) {
      showToast('Open a chat before generating an image.', true)
      return
    }

    generating = true
    setGenerationState(button, 'busy')
    try {
      const result = await readJson(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          chatId,
          forceGeneration: false,
          attachToMessageId: messageId,
          clientJobId: crypto.randomUUID(),
        }),
      })

      if (result.generated) {
        setGenerationState(button, 'success')
        showToast('Image generated.')
      } else {
        const reason = result.reason || 'Lumiverse did not generate an image.'
        setGenerationState(button, 'error')
        button.title = reason
        showToast(reason, true)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setGenerationState(button, 'error')
      button.title = detail
      showToast(detail, true)
    } finally {
      generating = false
      for (const actionButton of actionButtons) actionButton.disabled = false
      setTimeout(() => {
        if (!button.getAttribute('aria-busy')) setGenerationState(button, 'idle')
      }, 1800)
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
      void generateFromMessage(messageId, button)
    })
    actionWrappers.set(messageId, wrapper)
    actionButtons.add(button)
  }

  function scanMessageActions() {
    scanFrame = null
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

  return () => {
    disposed = true
    observer.disconnect()
    if (scanFrame !== null) cancelAnimationFrame(scanFrame)
    if (toastTimer) clearTimeout(toastTimer)
    if (typeof unsubscribeChatSwitched === 'function') unsubscribeChatSwitched()
    actionWrappers.clear()
    actionButtons.clear()
    tab.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
