/**
 * Generate a tree-style string representation of files
 *
 * Input: ["examples/invoice.pdf", "examples/report.pdf", "schema.json"]
 * Output:
 * ├── examples/
 * │   ├── invoice.pdf
 * │   └── report.pdf
 * └── schema.json
 */

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map(), isFile: false };

  for (const file of files) {
    const parts = file.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          children: new Map(),
          isFile: isLast,
        });
      }
      current = current.children.get(part)!;
    }
  }

  return root;
}

function renderTree(
  node: TreeNode,
  prefix: string = "",
  _isLast: boolean = true
): string {
  const lines: string[] = [];
  const children = Array.from(node.children.values()).sort((a, b) => {
    // Directories first, then alphabetical
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLastChild = i === children.length - 1;
    const connector = isLastChild ? "└── " : "├── ";
    const displayName = child.isFile ? child.name : child.name + "/";

    lines.push(prefix + connector + displayName);

    if (!child.isFile && child.children.size > 0) {
      const newPrefix = prefix + (isLastChild ? "    " : "│   ");
      lines.push(renderTree(child, newPrefix, isLastChild));
    }
  }

  return lines.join("\n");
}

/**
 * Generate a tree string from a list of file paths
 */
export function generateFileTree(files: string[]): string {
  if (files.length === 0) return "(no files)";

  // Filter out SKILL.md since that's the main file
  const filteredFiles = files.filter(
    (f) => f !== "SKILL.md" && f !== "skill.md"
  );
  if (filteredFiles.length === 0) return "(no additional files)";

  const tree = buildTree(filteredFiles);
  return renderTree(tree);
}
