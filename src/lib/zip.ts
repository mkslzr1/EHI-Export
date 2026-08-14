import { unzipSync } from "fflate";

const TABULAR_EXT = /\.(tsv|txt|csv)$/i;

/**
 * Expands any .zip files in the given list into synthetic File objects for
 * their tabular (tsv/txt/csv) entries, leaving other files untouched.
 */
export async function expandArchives(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      out.push(file);
      continue;
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(buffer, {
      filter: (entry) => TABULAR_EXT.test(entry.name) && !entry.name.startsWith("__MACOSX/"),
    });
    for (const [entryName, data] of Object.entries(entries)) {
      const baseName = entryName.split("/").pop() || entryName;
      out.push(new File([data.buffer as ArrayBuffer], baseName, { type: "text/plain" }));
    }
  }
  return out;
}

export function isSupportedFile(file: File): boolean {
  return TABULAR_EXT.test(file.name) || /\.zip$/i.test(file.name);
}
