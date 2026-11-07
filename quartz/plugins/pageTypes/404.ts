import { QuartzPageTypePlugin } from "../types"
import { match } from "./matchers"
import { NotFound } from "../../components"
import { defaultProcessedContent } from "../vfile"
import { i18n } from "../../i18n"
import { FullSlug } from "../../util/path"

export const NotFoundPageType: QuartzPageTypePlugin = () => ({
  name: "404",
  priority: -1,
  match: match.none(),
  generate({ cfg }) {
    const notFound = i18n(cfg.locale).pages.error.title
    const slug = "404" as FullSlug
    const [, vfile] = defaultProcessedContent({
      slug,
      text: notFound,
      description: notFound,
      frontmatter: { title: notFound, tags: [] },
    })

    return [
      {
        slug,
        title: notFound,
        // 生成的 404 页不应出现在「最近更新」/ 搜索等列表里
        data: { ...vfile.data, unlisted: true },
      },
    ]
  },
  layout: "404",
  frame: "minimal",
  body: NotFound,
})
