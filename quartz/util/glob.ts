import path from "path"
import { FilePath } from "./path"
import { globby } from "globby"

export function toPosixPath(fp: string): string {
  return fp.split(path.sep).join("/")
}

export async function glob(
  pattern: string,
  cwd: string,
  ignorePatterns: string[],
): Promise<FilePath[]> {
  const fps = (
    await globby(pattern, {
      cwd,
      ignore: ignorePatterns,
      // content/ 是 scripts/org-to-md.mjs 的生成物、在 .gitignore 里，
      // 但构建仍然要读它，所以这里不跟随 .gitignore（忽略规则由 ignorePatterns 负责）。
      gitignore: false,
    })
  ).map(toPosixPath)
  return fps as FilePath[]
}
