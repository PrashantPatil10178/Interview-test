import React, { useEffect, useRef, useState } from "react"
import { useToast } from "../../contexts/toast"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ChatBoxProps {
  onClose: () => void
}

export const ChatBox: React.FC<ChatBoxProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isSending])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    const history = messages
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed }
    ]
    setMessages(nextMessages)
    setInput("")
    setIsSending(true)

    try {
      const result = await window.electronAPI.sendChatMessage(
        trimmed,
        history
      )

      if (result.success) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.data || "" }
        ])
      } else {
        showToast("Chat Error", result.error || "Failed to get a response", "error")
        // Roll back the optimistic user message so it can be retried
        setMessages((prev) => prev.slice(0, -1))
        setInput(trimmed)
      }
    } catch (error) {
      console.error("Error sending chat message:", error)
      showToast("Chat Error", "Failed to send message", "error")
      setMessages((prev) => prev.slice(0, -1))
      setInput(trimmed)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
  }

  return (
    <div className="mt-2 w-[420px] max-w-full bg-black/70 backdrop-blur-md rounded-lg border border-white/10 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-medium text-white/90">Chat with AI</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="text-[11px] text-white/50 hover:text-white/80 transition-colors"
            title="Clear conversation"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white/90 transition-colors"
            title="Close chat"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-h-[320px] overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !isSending && (
          <p className="text-[11px] text-white/40 text-center py-6">
            Ask anything directly - no screenshot needed.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-white/90 border border-white/10"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] bg-white/5 border border-white/10 text-white/50">
              <span className="inline-flex gap-1">
                <span className="w-1 h-1 rounded-full bg-white/50 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 rounded-full bg-white/50 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 rounded-full bg-white/50 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 max-h-24"
        />
        <button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          className="bg-white text-black text-[11px] font-medium rounded-md px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default ChatBox
