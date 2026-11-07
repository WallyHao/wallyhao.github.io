import { sortDiagnostics } from "../diagnostics.js";
import { assignNodeIds, deepFreeze } from "../tree.js";
import { cacheSourceView, createSourceView } from "../source/source.js";
import { decodeUtf8 } from "../source/utf8.js";
import { parseStructure } from "./structure.js";
export function parse(input) {
    const prepared = createSourceView(input);
    if (!prepared.ok)
        return prepared;
    const view = prepared.value;
    const { document, diagnostics } = parseStructure(view);
    assignNodeIds(document);
    const value = deepFreeze({ modelVersion: "0.1", syntaxVersion: "0.1", source: view.source,
        document, diagnostics: sortDiagnostics(diagnostics) });
    cacheSourceView(view);
    return { ok: true, value };
}
export function parseUtf8(id, bytes, origin) {
    if (typeof id !== "string" || !id.length) {
        return { ok: false, error: { code: "invalid-source-id", message: "Source id must be a nonempty string." } };
    }
    const decoded = decodeUtf8(bytes);
    return decoded.ok ? parse({ id, text: decoded.value, origin }) : decoded;
}
//# sourceMappingURL=parse.js.map