import { useEffect, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import { Logo } from "@/components/shell/Logo";
import { Button, Icon } from "@/components/ui";
import { clsx } from "@/lib/format";
import { Markdown } from "./Markdown";
import { ChatCards } from "./ChatCards";

export interface MessageListProps {
  messages: ChatMessage[];
  draft: string;
  streaming: boolean;
  onPrompt: (prompt: string) => void;
  onRetry: () => void;
}

/** Scrollable thread. Auto-scrolls to the bottom on new content unless the reader scrolled up. */
export function MessageList({ messages, draft, streaming, onPrompt, onRetry }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastId = messages[messages.length - 1]?.id;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  /* New message: always jump to the bottom. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [lastId]);

  /* Streaming deltas: follow only while pinned. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [draft, messages]);

  return (
    <div className="thread" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-busy={streaming}>
      <div className="thread-inner">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const live = m.role === "assistant" && m.status === "streaming" && isLast;
          return <MessageView key={m.id} message={m} liveText={live ? draft : undefined} onPrompt={onPrompt} onRetry={onRetry} />;
        })}
      </div>
    </div>
  );
}

function MessageView({ message, liveText, onPrompt, onRetry }: { message: ChatMessage; liveText?: string; onPrompt: (p: string) => void; onRetry: () => void }) {
  if (message.role === "user") {
    return (
      <article className="msg msg-user">
        <div className="msg-bubble">
          <Markdown source={message.content} />
        </div>
      </article>
    );
  }
  const isLive = liveText !== undefined;
  const text = isLive ? liveText : message.content;
  const thinking = isLive && text.length === 0;
  return (
    <article className={clsx("msg msg-assistant", isLive && "is-live")}>
      <span className="msg-avatar" aria-hidden="true">
        <Logo size={16} />
      </span>
      <div className="msg-body">
        {thinking ? (
          <div className="msg-thinking" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="msg-content">
            <Markdown source={text} />
            {isLive ? <span className="msg-caret" aria-hidden="true" /> : null}
          </div>
        )}
        {message.status === "error" ? (
          <div className="msg-error" role="alert">
            <span className="msg-error-badge">
              <Icon name="alert" size={12} />
              Something went wrong
            </span>
            <Button size="sm" variant="ghost" icon="refresh" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}
        {!isLive && message.cards?.length ? <ChatCards cards={message.cards} onPrompt={onPrompt} /> : null}
      </div>
    </article>
  );
}
