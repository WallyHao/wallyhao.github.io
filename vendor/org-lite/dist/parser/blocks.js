import { diagnostic } from '../diagnostics.js';
import { lineValue, MappedTextBuilder } from '../source/mapped-text.js';
import { concatenate, Fragment } from '../source/fragment.js';
import { scanLatexBlock } from './latex.js';
export class BlockScanner {
    view;
    ends = new Map();
    cache = new Map();
    constructor(view) {
        this.view = view;
        view.lines.forEach((line, i) => {
            const match = /^#\+END_(SRC|EXAMPLE|COMMENT|QUOTE)[ \t]*$/i.exec(view.source.text.slice(line.indentEnd, line.contentEnd));
            if (!match)
                return;
            const key = `${match[1].toUpperCase()}:${line.indentColumns}`;
            const values = this.ends.get(key) ?? [];
            values.push(i);
            this.ends.set(key, values);
        });
    }
    header(index) {
        const line = this.view.lines[index];
        const text = this.view.source.text.slice(line.indentEnd, line.contentEnd);
        const m = /^#\+BEGIN_(SRC|EXAMPLE|COMMENT|QUOTE)(?:[ \t]+(.*))?$/is.exec(text);
        if (!m)
            return null;
        const kind = m[1].toUpperCase(), tail = (m[2] ?? '').replace(/^[ \t]+|[ \t]+$/g, '');
        const valid = !tail || (kind === 'SRC' && /^[A-Za-z0-9][A-Za-z0-9_+.-]*$/.test(tail));
        return { kind, valid, language: kind === 'SRC' && tail && valid ? tail : null, headerEnd: line.contentEnd };
    }
    probe(index, limit, cutColumn = 0) {
        const key = `${index}:${limit}:${cutColumn}`;
        if (this.cache.has(key))
            return this.cache.get(key);
        const h = this.header(index);
        if (!h)
            return null;
        const indent = this.view.lines[index].indentColumns;
        let close = -1;
        if (h.kind !== 'QUOTE') {
            const candidates = this.ends.get(`${h.kind}:${indent}`) ?? [];
            let lo = 0, hi = candidates.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (candidates[mid] <= index)
                    lo = mid + 1;
                else
                    hi = mid;
            }
            if (candidates[lo] !== undefined && candidates[lo] < limit)
                close = candidates[lo];
        }
        else {
            const stack = [indent];
            for (let i = index + 1; i < limit; i++) {
                const line = this.view.lines[i], text = this.view.source.text.slice(line.indentEnd, line.contentEnd);
                if (/^\*+[ \t]/.test(this.view.source.text.slice(line.start, line.contentEnd)))
                    break;
                const inner = this.header(i);
                if (inner && inner.kind !== 'QUOTE') {
                    const block = this.probe(i, limit, cutColumn);
                    if (block) {
                        i = block.close;
                        continue;
                    }
                }
                const latex = scanLatexBlock(this.view, i, limit, cutColumn);
                if (latex?.node) {
                    i = latex.next - 1;
                    continue;
                }
                if (inner?.kind === 'QUOTE')
                    stack.push(line.indentColumns);
                else if (/^#\+END_QUOTE[ \t]*$/i.test(text) && stack.at(-1) === line.indentColumns) {
                    stack.pop();
                    if (!stack.length) {
                        close = i;
                        break;
                    }
                }
            }
        }
        const match = close < 0 ? null : { ...h, close };
        this.cache.set(key, match);
        return match;
    }
}
export function blockDiagnostics(view, index, header, closed) {
    const line = view.lines[index], span = { start: view.byteAt(line.indentEnd), end: line.contentEndByte }, values = [];
    if (!header.valid)
        values.push(diagnostic(view.source, 'unsupported', span, 'Block header parameters are not supported.'));
    if (!closed)
        values.push(diagnostic(view.source, 'unclosed', span, `${header.kind} block has no matching closing line.`));
    return values;
}
export function blockRanges(view, index, close) {
    const a = view.lines[index], b = view.lines[close];
    return { span: { start: view.byteAt(a.indentEnd), end: b.endByte }, openSpan: { start: view.byteAt(a.indentEnd), end: a.endByte },
        bodySpan: { start: a.endByte, end: b.startByte }, closeSpan: { start: view.byteAt(b.indentEnd), end: b.endByte } };
}
export function opaqueValue(view, index, close, cut) {
    const values = [], indentation = view.lines[index].indentColumns;
    for (let i = index + 1; i < close; i++) {
        const line = view.lines[i];
        let value = lineValue(view, line, line.blank ? Math.min(cut, line.indentColumns) : Math.min(indentation, line.indentColumns));
        const m = /^[ \t]*(,+)(?=\*|#\+)/.exec(value.text);
        if (m) {
            const f = new Fragment(value), at = m[0].length - m[1].length;
            value = concatenate([f.slice(0, at), f.slice(at + 1, f.text.length)]);
        }
        values.push(value, new MappedTextBuilder(view).copy(line.contentEnd, line.end).finish());
    }
    return concatenate(values);
}
export function valueBlock(view, index, match, cut) {
    const common = { id: -1, ...blockRanges(view, index, match.close), affiliations: [], value: opaqueValue(view, index, match.close, cut) };
    return (match.kind === 'SRC' ? { ...common, kind: 'code_block', language: match.language } : { ...common, kind: 'example_block' });
}
//# sourceMappingURL=blocks.js.map