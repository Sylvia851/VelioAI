import type { ConvSource } from '@/composables/useConversations'

export function useChat() {
  const loading = ref(false)

  /**
   * Send a query via SSE streaming.
   *
   * @param question   The user's question
   * @param convId     Backend conversation ID (must already exist)
   * @param onChunk    Called for every text delta received from the model
   * @param onSources  Called once at the end with the retrieved source chunks
   */
  async function askStream(
    question: string,
    convId: string,
    onChunk: (text: string) => void,
    onSources: (sources: ConvSource[]) => void,
    metadataFilter?: Record<string, unknown>,
  ): Promise<void> {
    loading.value = true

    const token = localStorage.getItem('token') || ''
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

    const body: Record<string, unknown> = { query: question, conversation_id: convId }
    if (metadataFilter && Object.keys(metadataFilter).length > 0) {
      body.metadata_filter = metadataFilter
    }

    const response = await fetch(`${baseUrl}/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      loading.value = false
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE blocks are separated by \n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? '' // keep the incomplete trailing chunk

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') return

            try {
              const event = JSON.parse(payload) as {
                type: 'delta' | 'sources' | 'error'
                content?: string
                sources?: ConvSource[]
                message?: string
              }

              if (event.type === 'delta' && event.content) {
                onChunk(event.content)
              } else if (event.type === 'sources' && event.sources) {
                onSources(event.sources)
              } else if (event.type === 'error') {
                throw new Error(event.message || '流式请求出错')
              }
            } catch {
              // ignore individual malformed lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
      loading.value = false
    }
  }

  return { loading, askStream }
}
