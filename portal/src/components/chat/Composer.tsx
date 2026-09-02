import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button, Icon } from "@/components/ui";
import { clsx } from "@/lib/format";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, files: string[]) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder: string;
  adapterName: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_ROWS = 6;
const LINE_PX = 22;

export function Composer({ value, onChange, onSend, onStop, streaming, placeholder, adapterName, autoFocus, className }: ComposerProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listenTimer = useRef<number | null>(null);
  const id = useId();

  const canSend = value.trim().length > 0 || files.length > 0;

  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = LINE_PX * MAX_ROWS + 4;
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }, []);

  useEffect(resize, [value, resize]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  useEffect(
    () => () => {
      if (listenTimer.current != null) window.clearTimeout(listenTimer.current);
    },
    [],
  );

  const submit = useCallback(() => {
    if (streaming) {
      onStop();
      return;
    }
    if (!canSend) return;
    onSend(value, files);
    setFiles([]);
  }, [streaming, canSend, onSend, onStop, value, files]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming) submit();
    }
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const names = Array.from(list).map((f) => f.name);
    setFiles((prev) => Array.from(new Set([...prev, ...names])));
    e.target.value = "";
    taRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) {
      if (listenTimer.current != null) window.clearTimeout(listenTimer.current);
      setListening(false);
      return;
    }
    setListening(true);
    listenTimer.current = window.setTimeout(() => setListening(false), 2000);
  };

  return (
    <div className={clsx("composer-wrap", className)}>
      <div className={clsx("composer", streaming && "is-streaming", listening && "is-listening")}>
        {files.length ? (
          <ul className="composer-files" aria-label="Attached files">
            {files.map((f) => (
              <li key={f} className="composer-file">
                <Icon name="file" size={12} />
                <span className="truncate">{f}</span>
                <button type="button" className="composer-file-x" aria-label={`Remove ${f}`} onClick={() => setFiles((p) => p.filter((x) => x !== f))}>
                  <Icon name="x" size={11} strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor={id} className="sr-only">
          Message your agent
        </label>
        <textarea
          id={id}
          ref={taRef}
          className="composer-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-multiline="true"
          autoComplete="off"
          spellCheck
        />
        <div className="composer-bar">
          <div className="composer-left">
            <input ref={fileRef} type="file" multiple hidden onChange={onFiles} tabIndex={-1} aria-hidden="true" />
            <Button variant="ghost" icon="paperclip" aria-label="Attach files" title="Attach files" onClick={() => fileRef.current?.click()} />
          </div>
          <div className="composer-right">
            <button
              type="button"
              className={clsx("composer-mic", listening && "is-on")}
              aria-label={listening ? "Stop listening" : "Dictate a command"}
              aria-pressed={listening}
              title="Dictate"
              onClick={toggleMic}
            >
              <span className="composer-mic-pulse" aria-hidden="true" />
              <Icon name="mic" size={16} />
            </button>
            {streaming ? (
              <button type="button" className="composer-send is-stop" aria-label="Stop generating" title="Stop" onClick={onStop}>
                <span className="composer-stop-square" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="composer-send" aria-label="Send message" title="Send" disabled={!canSend} onClick={submit}>
                <Icon name="arrow-right" size={17} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="composer-hint">
        <span>Enter to send</span>
        <span aria-hidden="true">·</span>
        <span>Shift+Enter for a new line</span>
        <span aria-hidden="true">·</span>
        <span className="composer-hint-agent">{listening ? "Listening…" : adapterName}</span>
      </p>
    </div>
  );
}
