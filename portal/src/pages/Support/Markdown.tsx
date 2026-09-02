import { Fragment, type ReactNode } from "react";

/** Renders markdown-lite (paragraphs, "- " bullets, **bold**). Safe on partial/streaming text. */
export function MarkdownLite({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = text.split(/\n\s*\n/);
  const nodes: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (!lines.length) return;
    const isList = lines.every((l) => l.trimStart().startsWith("- "));
    const last = bi === blocks.length - 1;
    if (isList) {
      nodes.push(
        <ul key={bi}>
          {lines.map((l, li) => (
            <li key={li}>
              <span>
                {inline(l.trimStart().slice(2))}
                {caret && last && li === lines.length - 1 ? <Caret /> : null}
              </span>
            </li>
          ))}
        </ul>,
      );
    } else {
      // A paragraph may end with the start of a list while streaming: split it out.
      const para = lines.filter((l) => !l.trimStart().startsWith("- "));
      const items = lines.filter((l) => l.trimStart().startsWith("- "));
      nodes.push(
        <Fragment key={bi}>
          {para.length ? (
            <p>
              {inline(para.join(" "))}
              {caret && last && !items.length ? <Caret /> : null}
            </p>
          ) : null}
          {items.length ? (
            <ul>
              {items.map((l, li) => (
                <li key={li}>
                  <span>
                    {inline(l.trimStart().slice(2))}
                    {caret && last && li === items.length - 1 ? <Caret /> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Fragment>,
      );
    }
  });
  if (!nodes.length && caret) nodes.push(<p key="c"><Caret /></p>);
  return <div className="sp-md">{nodes}</div>;
}

function Caret() {
  return <span className="sp-caret" aria-hidden="true" />;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let i = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    out.push(<strong key={k++}>{m[1]}</strong>);
    i = m.index + m[0].length;
  }
  // An unclosed ** while streaming: show the raw remainder without the marker.
  const rest = s.slice(i).replace(/\*\*/g, "");
  if (rest) out.push(rest);
  return out;
}
