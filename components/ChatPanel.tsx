'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Bot, User, Send, PanelRightClose } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/types';

interface ChatPanelProps {
  chat: ChatMessage[];
  isTyping: boolean;
  streamingText: string;
  inputMessage: string;
  visible: boolean;
  planTitle: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onClose?: () => void;
}

export default function ChatPanel({ chat, isTyping, streamingText, inputMessage, visible, planTitle, onInputChange, onSend, onClose }: ChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // True while an IME composition is active (e.g. typing Chinese/Japanese) — we
  // must not treat the Enter that confirms a candidate as "send".
  const composingRef = useRef(false);
  // On touch devices there is no Shift+Enter, so Enter inserts a newline and the
  // user sends with the button — the conventional mobile-chat behaviour.
  const [enterInsertsNewline, setEnterInsertsNewline] = useState(false);

  useEffect(() => {
    setEnterInsertsNewline(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (visible) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, isTyping, streamingText, visible]);

  // Re-focus the input whenever the AI finishes responding
  useEffect(() => {
    if (!isTyping && visible) {
      inputRef.current?.focus();
    }
  }, [isTyping, visible]);

  // Auto-grow the textarea to fit its content, capped so it never eats the
  // whole panel. Re-runs as the text changes, and when the panel becomes
  // visible again (e.g. switching to the Chat tab on mobile).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // When the panel is hidden (mobile Tasks tab active), the textarea isn't
    // laid out so scrollHeight is 0 — measuring then would collapse it to
    // nothing. Skip until it's actually rendered.
    if (el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputMessage, visible]);

  const submit = () => {
    if (isTyping || !inputMessage.trim()) return;
    onSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    // Let IME confirmations, Shift+Enter, and mobile Enter fall through as newlines.
    if (e.shiftKey || composingRef.current || e.nativeEvent.isComposing || enterInsertsNewline) return;
    e.preventDefault();
    submit();
  };

  return (
    <div className={`absolute inset-0 flex flex-col ${!visible ? 'pointer-events-none' : ''}`}>
      <div className="relative p-4 border-b border-gray-100 bg-white/80 backdrop-blur sticky top-0 z-10 shrink-0 flex items-center">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 shrink-0">
          <MessageSquare className="w-4 h-4" /> AI Assistant
        </h2>
        <span className="hidden md:block absolute left-0 right-0 text-center text-sm font-semibold text-gray-800 truncate px-32 pointer-events-none">
          {planTitle}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            title="Close AI Assistant"
            aria-label="Close AI Assistant"
            className="hidden md:flex ml-auto relative z-10 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {chat.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'}`}>
              {msg.role === 'ai' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>

            {msg.role === 'user' ? (
              <div className="max-w-[80%] rounded-2xl rounded-tr-none px-4 py-2.5 text-sm leading-relaxed bg-indigo-600 text-white whitespace-pre-wrap break-words">
                {msg.text}
              </div>
            ) : (
              <div className="max-w-[80%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-gray-50 border border-gray-100 text-gray-800 prose prose-sm prose-indigo max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings
                    h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-2 mb-1 first:mt-0">{children}</h3>,
                    // Paragraphs
                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    // Lists
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="text-gray-700">{children}</li>,
                    // Bold / italic
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                    // Inline code
                    code: ({ children, className }) => {
                      const isBlock = className?.startsWith('language-');
                      return isBlock ? (
                        <code className="block bg-gray-100 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 overflow-x-auto my-2 whitespace-pre-wrap">
                          {children}
                        </code>
                      ) : (
                        <code className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono text-indigo-700">{children}</code>
                      );
                    },
                    // Code blocks
                    pre: ({ children }) => <pre className="bg-gray-100 rounded-lg p-3 overflow-x-auto my-2 text-xs">{children}</pre>,
                    // Tables (from remark-gfm)
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-xs border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-indigo-50">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold text-indigo-700 border border-gray-200">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-1.5 border border-gray-200 text-gray-700">{children}</td>,
                    tr: ({ children }) => <tr className="even:bg-gray-50">{children}</tr>,
                    // Blockquote
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-indigo-300 pl-3 italic text-gray-600 my-2">{children}</blockquote>
                    ),
                    // Horizontal rule
                    hr: () => <hr className="border-gray-200 my-3" />,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            {streamingText ? (
              <div className="max-w-[80%] rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed bg-gray-50 border border-gray-100 text-gray-800 prose prose-sm prose-indigo max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-2 mb-1 first:mt-0">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="text-gray-700">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                    code: ({ children, className }) => {
                      const isBlock = className?.startsWith('language-');
                      return isBlock ? (
                        <code className="block bg-gray-100 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 overflow-x-auto my-2 whitespace-pre-wrap">
                          {children}
                        </code>
                      ) : (
                        <code className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono text-indigo-700">{children}</code>
                      );
                    },
                    pre: ({ children }) => <pre className="bg-gray-100 rounded-lg p-3 overflow-x-auto my-2 text-xs">{children}</pre>,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-xs border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-indigo-50">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold text-indigo-700 border border-gray-200">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-1.5 border border-gray-200 text-gray-700">{children}</td>,
                    tr: ({ children }) => <tr className="even:bg-gray-50">{children}</tr>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-indigo-300 pl-3 italic text-gray-600 my-2">{children}</blockquote>
                    ),
                    hr: () => <hr className="border-gray-200 my-3" />,
                  }}
                >
                  {streamingText}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-100 shrink-0">
        <div className="relative flex items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            placeholder="Tell AI what to plan for you..."
            className="w-full resize-none pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm leading-relaxed max-h-40 overflow-y-auto"
            disabled={isTyping}
          />
          <button
            onClick={submit}
            disabled={isTyping || !inputMessage.trim()}
            aria-label="Send message"
            className="absolute right-2 bottom-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {!enterInsertsNewline && (
          <p className="mt-1.5 px-1 text-[11px] text-gray-400 select-none">
            <kbd className="font-sans font-medium text-gray-500">Enter</kbd> to send ·{' '}
            <kbd className="font-sans font-medium text-gray-500">Shift</kbd>+
            <kbd className="font-sans font-medium text-gray-500">Enter</kbd> for a new line
          </p>
        )}
      </div>
    </div>
  );
}
