import { lineValue, MappedTextBuilder } from '../source/mapped-text.js';
import { concatenate, Fragment } from '../source/fragment.js';
export function escaped(text, index) {
    let count = 0;
    while (index > 0 && text[--index] === '\\')
        count++;
    return count % 2 === 1;
}
export function balanced(text, start, limit = text.length, script = false) {
    const pairs = script ? { '{': '}', '(': ')' } : { '{': '}', '[': ']' }, stack = [pairs[text[start]]];
    if (!stack[0])
        return null;
    for (let i = start + 1; i < limit; i++) {
        if (escaped(text, i))
            continue;
        const c = text[i];
        if (script && (c === '~' || c === '=') && /[\s\p{P}\p{S}\p{Script=Han}]/u.test(text[i - 1] ?? '') && !/\s/u.test(text[i + 1] ?? ' ')) {
            let end = i + 1;
            while (end < limit && text[end] !== '\n') {
                if (text[end] === c && end > i + 1 && !/\s/u.test(text[end - 1]) && (end + 1 === limit || /[\s\p{P}\p{S}\p{Script=Han}]/u.test(text[end + 1])))
                    break;
                end++;
            }
            if (end < limit && text[end] === c) {
                i = end;
                continue;
            }
        }
        if (pairs[c])
            stack.push(pairs[c]);
        else if (Object.values(pairs).includes(c)) {
            if (stack.pop() !== c)
                return null;
            if (!stack.length)
                return i + 1;
        }
    }
    return null;
}
export function latexInline(f, start, limit) {
    const text = f.text;
    if (escaped(text, start) || f.protected(start))
        return null;
    let open = '', close = '', form = 'paren';
    if (text.startsWith('\\(', start)) {
        open = '\\(';
        close = '\\)';
    }
    else if (text.startsWith('\\[', start)) {
        open = '\\[';
        close = '\\]';
        form = 'bracket';
    }
    else if (text.startsWith('$$', start)) {
        open = close = '$$';
        form = 'double_dollar';
    }
    else if (text[start] === '$' && text[start - 1] !== '$') {
        open = close = '$';
        form = 'dollar';
    }
    if (!open) {
        const command = /^\\([A-Za-z]+\*?)/.exec(text.slice(start, limit));
        if (!command || command[1] === 'begin' || command[1] === 'end')
            return null;
        let end = start + command[0].length, args = 0;
        while (text[end] === '{' || text[end] === '[') {
            const next = balanced(text, end, limit);
            if (next === null)
                return null;
            end = next;
            args++;
        }
        if (!args)
            return null;
        return { end, node: { id: -1, kind: 'latex', span: f.range(start, end), affiliations: [], placement: 'inline', form: 'command', name: command[1], openSpan: null, closeSpan: null, bodySpan: f.range(start, end), value: f.slice(start, end) } };
    }
    for (let end = start + open.length; end < limit; end++) {
        if (!text.startsWith(close, end) || escaped(text, end) || end + close.length > limit)
            continue;
        const body = text.slice(start + open.length, end);
        if (!/\S/u.test(body))
            continue;
        if (form === 'dollar' && (/^\s|\s$/u.test(body) || (body.match(/\n/g)?.length ?? 0) > 2 || text[end + 1] === '-' ||
            (end + 1 < limit && !/[\s\p{P}]/u.test(text[end + 1]))))
            continue;
        return { end: end + close.length, node: { id: -1, kind: 'latex', span: f.range(start, end + close.length), affiliations: [], placement: 'inline', form, name: null,
                openSpan: f.range(start, start + open.length), bodySpan: f.range(start + open.length, end), closeSpan: f.range(end, end + close.length), value: f.slice(start + open.length, end) } };
    }
    return null;
}
export function scanLatexBlock(view, index, limit, cut) {
    const line = view.lines[index], start = line.indentEnd, text = view.source.text;
    const head = /^(\\\[|\$\$|\\begin\{([A-Za-z][A-Za-z0-9_-]*\*?)\})/.exec(text.slice(start, line.contentEnd));
    if (!head)
        return null;
    let endStart = -1, endLength = 0, endLine = index;
    const environment = head[2] ?? null;
    if (environment) {
        const re = /\\(begin|end)\{([A-Za-z][A-Za-z0-9_-]*\*?)\}/g;
        re.lastIndex = start + head[0].length;
        const names = [environment];
        const boundary = limit < view.lines.length ? view.lines[limit].start : text.length;
        let m;
        while ((m = re.exec(text)) && m.index < boundary) {
            if (escaped(text, m.index))
                continue;
            if (m[1] === 'begin')
                names.push(m[2]);
            else {
                if (names.at(-1) !== m[2])
                    break;
                names.pop();
                if (!names.length) {
                    endStart = m.index;
                    endLength = m[0].length;
                    break;
                }
            }
        }
    }
    else {
        const close = head[1] === '$$' ? '$$' : '\\]';
        let cursor = start + head[0].length;
        const boundary = limit < view.lines.length ? view.lines[limit].start : text.length;
        while ((cursor = text.indexOf(close, cursor)) >= 0 && cursor < boundary) {
            if (!escaped(text, cursor)) {
                endStart = cursor;
                endLength = close.length;
                break;
            }
            cursor += close.length;
        }
    }
    if (endStart < 0)
        return { node: null, next: index + 1, unclosed: true };
    while (endLine < limit && view.lines[endLine].contentEnd < endStart + endLength)
        endLine++;
    if (endLine >= limit)
        return { node: null, next: index + 1, unclosed: true };
    if (!/^[ \t]*$/.test(text.slice(endStart + endLength, view.lines[endLine].contentEnd)))
        return endLine === index ? null : { node: null, next: index + 1, unclosed: true };
    const chunks = [];
    for (let i = index; i <= endLine; i++) {
        const l = view.lines[i], value = i === index ? new MappedTextBuilder(view).copy(start + head[0].length, i === endLine ? endStart : l.contentEnd).finish() : lineValue(view, l, Math.min(cut, l.indentColumns));
        const f = new Fragment(value);
        chunks.push(i === endLine && i !== index ? f.slice(0, Math.max(0, f.text.length - (l.contentEnd - endStart))) : value);
        if (i < endLine)
            chunks.push(new MappedTextBuilder(view).copy(l.contentEnd, l.end).finish());
    }
    const value = concatenate(chunks);
    if (!environment && !/\S/u.test(value.text))
        return null;
    return { next: endLine + 1, unclosed: false, node: { id: -1, kind: 'latex', affiliations: [], placement: 'block',
            form: environment ? 'environment' : head[1] === '$$' ? 'double_dollar' : 'bracket', name: environment,
            span: { start: view.byteAt(start), end: view.lines[endLine].endByte }, openSpan: view.range(start, start + head[0].length),
            bodySpan: view.range(start + head[0].length, endStart), closeSpan: view.range(endStart, endStart + endLength), value: value } };
}
//# sourceMappingURL=latex.js.map