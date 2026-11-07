import { registerCondition } from "./quartz/plugins/loader/conditions"
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

// ---------------------------------------------------------------------------
// TypeScript 覆写层
//
// YAML 只能表达静态配置；需要函数的地方（过滤、排序、自定义 layout 条件）
// 在这里注册，然后就能在 quartz.config.yaml 里按名字引用。
// ---------------------------------------------------------------------------

// 只在首页渲染（内置条件里只有 not-index / has-tags / has-backlinks / has-toc）
registerCondition("index", (props) => props.fileData.slug === "index")

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
