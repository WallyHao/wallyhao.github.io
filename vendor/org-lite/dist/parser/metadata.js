import { diagnostic } from '../diagnostics.js';
import { MappedTextBuilder } from '../source/mapped-text.js';
import { trimHorizontal } from '../source/fragment.js';
export function propertyDrawer(view, index, limit) {
    const first = view.lines[index];
    if (!first || !/^:PROPERTIES:[ \t]*$/i.test(view.source.text.slice(first.indentEnd, first.contentEnd)))
        return null;
    let close = index + 1;
    for (; close < limit; close++) {
        const line = view.lines[close];
        if (/^\*+[ \t]/.test(view.source.text.slice(line.start, line.contentEnd)))
            break;
        if (/^:END:[ \t]*$/i.test(view.source.text.slice(line.indentEnd, line.contentEnd)))
            break;
    }
    const span = { start: view.byteAt(first.indentEnd), end: first.endByte };
    if (close >= limit || !/^:END:[ \t]*$/i.test(view.source.text.slice(view.lines[close].indentEnd, view.lines[close].contentEnd)))
        return {
            node: { id: -1, kind: 'raw_block', form: 'line', span }, next: index + 1,
            diagnostics: [diagnostic(view.source, 'unclosed', { start: span.start, end: first.contentEndByte }, 'Property drawer has no END.')],
        };
    const last = view.lines[close], entries = [];
    let valid = true;
    for (let i = index + 1; i < close; i++) {
        const line = view.lines[i], text = view.source.text.slice(line.indentEnd, line.contentEnd), m = /^:([A-Za-z0-9_+\-]+):(.*)$/s.exec(text);
        if (!m || m[1].toUpperCase() === 'END') {
            valid = false;
            continue;
        }
        entries.push({ id: -1, kind: 'property', span: { start: view.byteAt(line.indentEnd), end: line.endByte }, key: m[1].toUpperCase(),
            keySpan: view.range(line.indentEnd + 1, line.indentEnd + 1 + m[1].length),
            value: trimHorizontal(new MappedTextBuilder(view).copy(line.indentEnd + m[1].length + 2, line.contentEnd).finish()) });
    }
    const fullSpan = { start: span.start, end: last.endByte };
    return valid ? { node: { id: -1, kind: 'property_drawer', span: fullSpan, openSpan: span, closeSpan: { start: view.byteAt(last.indentEnd), end: last.endByte }, entries }, next: close + 1, diagnostics: [] } : {
        node: { id: -1, kind: 'raw_block', span: fullSpan, form: 'region' }, next: close + 1,
        diagnostics: [diagnostic(view.source, 'malformed', fullSpan, 'Property drawer contains a non-property line.')],
    };
}
//# sourceMappingURL=metadata.js.map