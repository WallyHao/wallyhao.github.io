import { registerCondition } from "./quartz/plugins/loader/conditions"
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

// ---------------------------------------------------------------------------
// TypeScript override layer.
//
// YAML can only express static configuration. Anything that needs a function
// (filters, sorters, custom layout conditions) is registered here and then
// referenced by name from quartz.config.yaml.
// ---------------------------------------------------------------------------

// Render on the home page only. Built-in conditions are not-index, has-tags,
// has-backlinks and has-toc.
registerCondition("index", (props) => props.fileData.slug === "index")

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
