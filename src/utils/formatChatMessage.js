function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 将助手回复转为安全 HTML（支持常见 Markdown）
 * @param {string} text
 */
export function formatAssistantMessage(text) {
  if (!text) return ''

  const lines = String(text).split('\n')
  const htmlParts = []
  let listType = null
  let listItems = []

  function flushList() {
    if (!listItems.length) return
    const tag = listType === 'ol' ? 'ol' : 'ul'
    htmlParts.push(`<${tag}>${listItems.map((i) => `<li>${i}</li>`).join('')}</${tag}>`)
    listItems = []
    listType = null
  }

  function inlineFormat(line) {
    let s = escapeHtml(line)
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    return s
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (!trimmed) {
      flushList()
      continue
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/)
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)

    if (ulMatch) {
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(inlineFormat(ulMatch[1]))
      continue
    }

    if (olMatch) {
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(inlineFormat(olMatch[1]))
      continue
    }

    flushList()
    htmlParts.push(`<p>${inlineFormat(trimmed)}</p>`)
  }

  flushList()
  return htmlParts.join('') || `<p>${inlineFormat(String(text).trim())}</p>`
}
