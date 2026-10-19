// Jupyter notebooks linked from course sites (DATA 101 projects and discussions).

/** DataHub git-pull link → raw GitHub URL of the notebook it opens, or null if it isn't one. */
export function datahubToRaw(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const repo = url.searchParams.get("repo")?.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  const branch = url.searchParams.get("branch") ?? "main";
  const path = url.searchParams.get("urlpath")?.match(/^lab\/tree\/[^/]+\/(.+)$/)?.[1];
  if (!repo || !path) return null;
  return `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${branch}/${path}`;
}

type Cell = { cell_type?: string; source?: string | string[] };

/** Markdown cells pass through, code cells become python fences, outputs are dropped. */
export function notebookToMarkdown(json: unknown): string {
  const cells = ((json as { cells?: Cell[] })?.cells ?? []) as Cell[];
  return cells
    .map((c) => {
      const src = (Array.isArray(c.source) ? c.source.join("") : (c.source ?? "")).replace(/\s+$/, "");
      if (!src) return "";
      if (c.cell_type === "code") return "```python\n" + src + "\n```";
      return src;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Raw GitHub URL → the rendered blob page, for "Open original" links; null if it isn't one. */
export function rawToBlob(url: string): string | null {
  const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/blob/${m[3]}/${m[4]}` : null;
}
