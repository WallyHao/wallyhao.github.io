import { MappedTextBuilder } from "../source/mapped-text.js";
import { appendParagraph, bodyState, flush } from "./context.js";
export function listMarker(view, line) {
    const text = view.source.text.slice(line.indentEnd, line.contentEnd);
    const match = /^(?:([-])|([0-9]+)\.)([ \t]+)/.exec(text);
    if (!match)
        return null;
    let column = line.indentColumns;
    for (const char of match[0])
        column += char === "\t" ? 8 - column % 8 : 1;
    return { style: match[1] ? "unordered" : "ordered", ordinal: match[2] ?? null,
        start: line.indentEnd, after: line.indentEnd + match[0].length,
        column: line.indentColumns, contentColumn: column };
}
function itemFor(view, line, marker) {
    const text = view.source.text;
    let after = marker.after;
    let checkbox = null;
    const candidate = text.slice(after, after + 3);
    if ((candidate === "[ ]" || candidate === "[X]" || candidate === "[-]") &&
        (after + 3 === line.contentEnd || text[after + 3] === " " || text[after + 3] === "\t")) {
        checkbox = { span: view.range(after, after + 3), state: candidate === "[ ]" ? "unchecked" : candidate === "[X]" ? "checked" : "partial" };
        after += 3;
        while (after < line.contentEnd && (text[after] === " " || text[after] === "\t"))
            after++;
    }
    const item = {
        id: -1, kind: "list_item", span: { start: view.byteAt(marker.start), end: line.endByte },
        markerSpan: view.range(marker.start, marker.after), ordinal: marker.ordinal,
        markerColumn: marker.column, contentColumn: marker.contentColumn, checkbox, body: [],
    };
    const state = bodyState(item.body);
    appendParagraph(state, new MappedTextBuilder(view).copy(after, line.contentEnd).finish(), line);
    return { item, state };
}
export function startList(view, line, marker, parent) {
    flush(parent);
    const { item, state } = itemFor(view, line, marker);
    const list = { id: -1, kind: "list", span: { start: item.span.start, end: item.span.end },
        affiliations: [], style: marker.style, items: [item] };
    parent.body.push(list);
    return { list, item, state, column: marker.column, contentColumn: marker.contentColumn, guardLimit: null };
}
export function finishItem(frame) {
    flush(frame.state);
    const last = frame.item.body.at(-1);
    if (last)
        frame.item.span.end = Math.max(frame.item.span.end, last.span.end);
    frame.list.span.end = frame.item.span.end;
}
export function nextItem(frame, view, line, marker) {
    finishItem(frame);
    const { item, state } = itemFor(view, line, marker);
    frame.list.items.push(item);
    frame.item = item;
    frame.state = state;
    frame.contentColumn = marker.contentColumn;
    frame.guardLimit = null;
}
//# sourceMappingURL=lists.js.map