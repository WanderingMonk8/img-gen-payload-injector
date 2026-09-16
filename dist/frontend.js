const CONNECTIONS_URL = '/api/v1/image-gen-connections'

async function readJson(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options })
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
      <div class="ipi-note">Save applies to future generations from Lumiverse’s existing image controls when this connection is selected. JSON is merged into the outgoing request body. Fields such as prompt or model may replace Lumiverse’s values.</div>
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
    message('Loading connections…')
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
    message('Saving…')
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
      message(remove ? 'Override cleared.' : 'Override saved. Use Lumiverse’s existing Generate button.')
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

  return () => {
    disposed = true
    tab.destroy()
    removeStyle()
  }
}
