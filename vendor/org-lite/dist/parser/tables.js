import { MappedTextBuilder } from '../source/mapped-text.js';
import { trimHorizontal } from '../source/fragment.js';
import { textNode } from './context.js';
export function table(view, index, limit, cut) {
    const rows = [];
    let columns = 0, i = index;
    for (; i < limit; i++) {
        const line = view.lines[i], raw = view.source.text.slice(line.indentEnd, line.contentEnd);
        if (line.indentColumns < cut || !raw.startsWith('|'))
            break;
        const span = { start: view.byteAt(line.indentEnd), end: line.endByte };
        if (/^\|-+(?:\+-+)*\|[ \t]*$/.test(raw)) {
            rows.push({ id: -1, kind: 'table_separator', span });
            continue;
        }
        const cells = [];
        let start = line.indentEnd + 1;
        let end = line.contentEnd;
        while (end > start && /[ \t]/.test(view.source.text[end - 1]))
            end--;
        const closing = end > start && view.source.text[end - 1] === '|';
        const boundary = closing ? end - 1 : line.contentEnd;
        for (let cursor = start; cursor <= boundary; cursor++) {
            if (cursor !== boundary && view.source.text[cursor] !== '|')
                continue;
            const value = trimHorizontal(new MappedTextBuilder(view).copy(start, cursor).finish());
            const match = /^<(?:(l|c|r)([1-9][0-9]*)?|([1-9][0-9]*))>$/.exec(value.text), content = textNode(value);
            cells.push({ id: -1, kind: 'table_cell', span: view.range(start, cursor), content: match || !content ? [] : [content], format: match ? {
                    alignment: match[1] === 'l' ? 'left' : match[1] === 'c' ? 'center' : match[1] === 'r' ? 'right' : null, width: match[2] ?? match[3] ?? null
                } : null });
            start = cursor + 1;
        }
        columns = Math.max(columns, cells.length);
        rows.push({ id: -1, kind: 'table_row', span, role: cells.some(c => c.format) && cells.every(c => c.format || !c.content.length) ? 'format' : 'data', cells });
    }
    return { next: i, node: { id: -1, kind: 'table', span: { start: view.byteAt(view.lines[index].indentEnd), end: view.lines[i - 1].endByte }, affiliations: [], columnCount: columns, rows } };
}
//# sourceMappingURL=tables.js.map