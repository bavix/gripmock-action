import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const files = ["main.js", "post.js"];

await fs.mkdir(distDir, { recursive: true });

for (const file of files) {
  const sourcePath = path.join(srcDir, file);
  const distPath = path.join(distDir, file);

  const source = await fs.readFile(sourcePath, "utf8");
  const rendered = `// This file is generated from src/${file}. Do not edit directly.\n${source}`;

  await fs.writeFile(distPath, rendered, "utf8");
}
