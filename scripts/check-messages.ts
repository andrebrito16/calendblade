/**
 * CI check: every locale file has exactly the keys of en.json (and no extras),
 * and every ICU placeholder used in English exists in the translation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Tree = { [key: string]: string | Tree | Tree[] };
const dir = join(process.cwd(), "src/messages");

function flatten(tree: unknown, prefix = "", out = new Map<string, string>()) {
  if (typeof tree === "string") out.set(prefix, tree);
  else if (Array.isArray(tree)) {
    for (const [index, item] of tree.entries()) flatten(item, `${prefix}[${index}]`, out);
  } else if (tree && typeof tree === "object") {
    for (const [key, value] of Object.entries(tree)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)/g)].map((match) => match[1]));

const base = flatten(JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Tree);
let failed = false;
for (const file of readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "en.json")) {
  const other = flatten(JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree);
  const missing = [...base.keys()].filter((key) => !other.has(key));
  const extra = [...other.keys()].filter((key) => !base.has(key));
  const badPlaceholders = [...base.entries()].filter(([key, text]) => {
    const translated = other.get(key);
    return (
      translated !== undefined && [...placeholders(text)].some((name) => !placeholders(translated).has(name))
    );
  });
  for (const key of missing) console.error(`${file}: missing ${key}`);
  for (const key of extra) console.error(`${file}: unknown key ${key}`);
  for (const [key] of badPlaceholders) console.error(`${file}: placeholders differ in ${key}`);
  if (missing.length || extra.length || badPlaceholders.length) failed = true;
  else console.log(`${file}: ${other.size} keys OK`);
}
process.exit(failed ? 1 : 0);
