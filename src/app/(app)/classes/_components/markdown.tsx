import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

/** Transcribed material: GFM plus $…$ / $$…$$ math. Links open in a new tab. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
