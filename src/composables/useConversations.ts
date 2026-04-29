import request from '@/utils/request'

export interface ConvSource {
  chunk_id: string
  doc_id: string
  content: string
  score: number
  metadata?: Record<string, unknown>
}

export interface ConvMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ConvSource[]
  created_at: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export function useConversations() {
  const conversations = ref<Conversation[]>([])
  const loading = ref(false)

  // ── format updated_at for display ─────────────────────────────────────────
  function getDisplayTime(conv: Conversation): string {
    const date = new Date(conv.updated_at)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86_400_000)
    const hhmm = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (date >= today) return `今天 ${hhmm}`
    if (date >= yesterday) return `昨天 ${hhmm}`
    return `${date.getMonth() + 1}/${date.getDate()} ${hhmm}`
  }

  // ── remote calls ──────────────────────────────────────────────────────────

  async function fetchConversations() {
    loading.value = true
    try {
      conversations.value = await request.get<Conversation[]>('/conversations')
    } finally {
      loading.value = false
    }
  }

  async function createConversation(title = '新对话'): Promise<Conversation> {
    const conv = await request.post<Conversation>('/conversations', { title })
    conversations.value.unshift(conv)
    return conv
  }

  async function renameConversation(convId: string, title: string): Promise<void> {
    await request.patch<Conversation>(`/conversations/${convId}`, { title })
    const conv = conversations.value.find(c => c.id === convId)
    if (conv) conv.title = title
  }

  async function deleteConversation(convId: string): Promise<void> {
    // pass data:{} so the request interceptor doesn't reject the DELETE
    await request({ method: 'delete', url: `/conversations/${convId}`, data: {} })
    const idx = conversations.value.findIndex(c => c.id === convId)
    if (idx !== -1) conversations.value.splice(idx, 1)
  }

  async function fetchMessages(convId: string): Promise<ConvMessage[]> {
    return request.get<ConvMessage[]>(`/conversations/${convId}/messages`)
  }

  /** Update local list after a new assistant message is persisted by the server. */
  function touchConversation(convId: string) {
    const conv = conversations.value.find(c => c.id === convId)
    if (conv) conv.updated_at = new Date().toISOString()
    // re-sort by updated_at desc
    conversations.value.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }

  return {
    conversations,
    loading,
    fetchConversations,
    createConversation,
    renameConversation,
    deleteConversation,
    fetchMessages,
    touchConversation,
    getDisplayTime,
  }
}
