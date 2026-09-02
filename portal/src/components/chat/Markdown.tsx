import { Fragment, useMemo, type ReactNode } from "react";

/**
 * Markdown-lite renderer for agent replies.
 * Supports: paragraphs (blank-line separated), "- " bullet lines, **bold**, `code`.
 * Single newlines inside a paragraph render as line breaks.
 */

type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const chunks = src.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ type: "p", lines: para });
      para = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ type: "ul", items: list });
      list = [];
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (/^[-•]\s+/.test(line)) {
        flushPara();
        list.push(line.replace(/^[-•]\s+/, ""));
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    const k = `${keyPrefix}-${i++}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={k}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(<code key={k}>{part.slice(1, -1)}</code>);
    } else {
      out.push(<Fragment key={k}>{part}</Fragment>);
    }
  }
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className={className ? `md ${className}` : "md"}>
      {blocks.map((b, bi) =>
        b.type === "ul" ? (
          <ul key={bi} className="md-list">
            {b.items.map((it, ii) => (
              <li key={ii}>{renderInline(it, `${bi}-${ii}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={bi}>
            {b.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 ? <br /> : null}
                {renderInline(line, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
