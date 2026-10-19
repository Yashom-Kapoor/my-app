import { describe, expect, it } from "vitest";
import { datahubToRaw, notebookToMarkdown, rawToBlob } from "./notebook";

const base = "https://data101.datahub.berkeley.edu/hub/user-redirect/git-pull?";
const raw1 = "https://raw.githubusercontent.com/data-101-berkeley/fa26-materials/main/proj/proj1/proj1.ipynb";

describe("datahubToRaw", () => {
  it("maps the proj1 link", () => {
    expect(datahubToRaw(`${base}repo=https%3A%2F%2Fgithub.com%2Fdata-101-berkeley%2Ffa26-materials&branch=main&urlpath=lab%2Ftree%2Ffa26-materials%2Fproj%2Fproj1%2Fproj1.ipynb`)).toBe(raw1);
  });
  it("maps the proj0 link with params reordered", () => {
    expect(datahubToRaw(`${base}repo=https%3A%2F%2Fgithub.com%2Fdata-101-berkeley%2Ffa26-materials&urlpath=lab%2Ftree%2Ffa26-materials%2Fproj%2Fproj0%2Fproj0.ipynb&branch=main`)).toBe(
      "https://raw.githubusercontent.com/data-101-berkeley/fa26-materials/main/proj/proj0/proj0.ipynb",
    );
  });
  it("returns null for other links", () => {
    expect(datahubToRaw("https://example.com/x")).toBeNull();
  });
});

describe("notebookToMarkdown", () => {
  it("passes markdown, fences code, drops outputs", () => {
    const nb = { cells: [
      { cell_type: "markdown", source: ["# Title\n", "text"] },
      { cell_type: "code", source: ["SELECT 1;"], outputs: [{ text: "1" }] },
    ] };
    expect(notebookToMarkdown(nb)).toBe("# Title\ntext\n\n```python\nSELECT 1;\n```");
  });
});

describe("rawToBlob", () => {
  it("maps a raw URL to the rendered blob page", () => {
    expect(rawToBlob(raw1)).toBe("https://github.com/data-101-berkeley/fa26-materials/blob/main/proj/proj1/proj1.ipynb");
    expect(rawToBlob("https://example.com/x")).toBeNull();
  });
});
