'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface ChatResponsePayload {
  success: boolean;
  reply: string;
  requestId?: string | null;
  attestationId?: string | null;
  currency?: string;
  contextStats?: {
    summaryMonths: number;
    transactions: number;
    insights: number;
    goals: number;
  };
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
  };
}

const PROMPT_SUGGESTIONS = [
  'Where am I overspending the most in the last 3 months?',
  'Which goal should I prioritize first and why?',
  'Create a 30-day cash flow improvement plan for me.',
  'What are my top recurring expenses and how can I reduce them?',
];

function MarkdownMessage({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div
      className={[
        'space-y-2',
        '[&_p]:my-2',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-gray-100 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-700',
        '[&_a]:text-blue-600 [&_a]:underline',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse',
        '[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function TalkToMyDataPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      'assistant',
      'Ask me anything about your finances. I can use your transaction summaries, onboarding profile, insights, and goals to answer.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [contextStats, setContextStats] = useState<ChatResponsePayload['contextStats'] | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages, isSending]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setError('');
    const userMessage = createMessage('user', trimmed);
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch('/api/chat/data-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({
              role: message.role,
              content: message.content,
            }))
            .slice(-24),
        }),
      });

      const payload = (await response.json()) as ChatResponsePayload & { error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to get response from assistant');
      }

      setMessages((prev) => [...prev, createMessage('assistant', payload.reply)]);
      setCurrency(String(payload.currency || 'USD').toUpperCase());
      setContextStats(payload.contextStats || null);
    } catch (err: any) {
      const message = err?.message || 'Chat request failed';
      setError(message);
      setMessages((prev) => [
        ...prev,
        createMessage('assistant', `I couldn't process that request right now. ${message}`),
      ]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const sendSuggestion = (prompt: string) => {
    if (isSending) return;
    setInput(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Talk To My Data</h1>
        <p className="text-sm text-gray-500 sm:text-base">
          Chat with your private financial assistant using your summaries, onboarding profile, goals, and insights.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Data Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-6">
            <div
              ref={scrollContainerRef}
              className="h-[52vh] min-h-[360px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 sm:h-[58vh] sm:p-4"
            >
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-xl px-3 py-2 text-sm sm:max-w-[80%] ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-200 bg-white text-gray-900'
                      }`}
                    >
                      <MarkdownMessage content={message.content} isUser={message.role === 'user'} />
                    </div>
                  </div>
                ))}

                {isSending ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleSend} className="space-y-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a question about your finances..."
                className="min-h-[94px] w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring-2"
                disabled={isSending}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Context currency: <span className="font-semibold">{currency}</span>
                </p>
                <Button type="submit" disabled={isSending || input.trim().length === 0}>
                  {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Prompt Ideas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-6">
            {PROMPT_SUGGESTIONS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                onClick={() => sendSuggestion(prompt)}
                disabled={isSending}
              >
                {prompt}
              </button>
            ))}

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <p className="font-semibold">Context Sources</p>
              <p className="mt-1">Transaction summaries, onboarding data, insights, and goals are used for answers.</p>
            </div>

            {contextStats ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                <p className="font-semibold text-gray-900">Current Context Size</p>
                <p className="mt-1">Months: {contextStats.summaryMonths}</p>
                <p>Transactions: {contextStats.transactions}</p>
                <p>Insights: {contextStats.insights}</p>
                <p>Goals: {contextStats.goals}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
