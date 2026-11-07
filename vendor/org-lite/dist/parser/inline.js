import { children } from '../tree.js';
import { concatenate, Fragment } from '../source/fragment.js';
import { entities } from '../data/entities.js';
import { balanced, latexInline } from './latex.js';
import { footnoteLabel, linkAt } from './links.js';
import { MappedTextBuilder } from '../source/mapped-text.js';
const boundary = (c) => c === undefined || /[\s\p{P}\p{S}\p{Script=Han}]/u.test(c);
const before = (text, at) => [...text.slice(Math.max(0, at - 2), at)].at(-1);
const after = (text, at) => text.codePointAt(at) === undefined ? undefined : String.fromCodePoint(text.codePointAt(at));
function plain(f, start, end) { return { id: -1, kind: 'text', span: f.range(start, end), value: f.slice(start, end) }; }
export function parseInline(value, mode, sourceId, diagnostics) {
    const result = [];
    const jobs = [{ value, mode, markers: '', output: result }];
    const report = (code, f, a, b, message) => diagnostics.push({ code, phase: 'parse', location: { sourceId, span: f.range(a, b) }, message, related: [] });
    function atomic(f, start, limit, mode, sink) {
        const text = f.text, c = text[start];
        if (f.protected(start))
            return null;
        const literalUrl = /^(?:https?:\/\/[^\s<>]+|<https?:\/\/[^<>\n]+>)/u.exec(text.slice(start, limit));
        if (literalUrl)
            return { end: start + literalUrl[0].length, node: { id: -1, kind: 'raw_inline', span: f.range(start, start + literalUrl[0].length) } };
        if ((c === '~' || c === '=') && boundary(before(text, start)) && start + 1 < limit && !/\s/u.test(after(text, start + 1))) {
            for (let end = start + 1; end < limit && text[end] !== '\n'; end++) {
                if (text[end] === c && end > start + 1 && !/\s/u.test(before(text, end)) && boundary(end + 1 === limit ? undefined : after(text, end + 1)))
                    return {
                        end: end + 1, node: { id: -1, kind: c === '~' ? 'inline_code' : 'verbatim', span: f.range(start, end + 1), openSpan: f.range(start, start + 1), bodySpan: f.range(start + 1, end), closeSpan: f.range(end, end + 1), value: f.slice(start + 1, end) },
                    };
            }
        }
        if (c === '\\') {
            const entity = /^\\([A-Za-z][A-Za-z0-9]*)(\{\})?/.exec(text.slice(start, limit));
            if (entity && Object.hasOwn(entities, entity[1]) && (text[start + entity[0].length] !== '{' || !!entity[2]))
                return {
                    end: start + entity[0].length, node: { id: -1, kind: 'entity', span: f.range(start, start + entity[0].length), name: entity[1], nameSpan: f.range(start + 1, start + 1 + entity[1].length), terminated: !!entity[2] },
                };
        }
        const latex = (c === '\\' || c === '$') ? latexInline(f, start, limit) : null;
        if (latex)
            return latex;
        if (mode !== 'minimal' && text.startsWith('[[', start))
            return linkAt(f, start, limit, sourceId, sink);
        if (mode !== 'minimal' && text.startsWith('[fn:', start)) {
            const end = text.indexOf(']', start + 4);
            if (end >= 0 && end < limit && !text.slice(start, end).includes('\n')) {
                const label = text.slice(start + 4, end);
                if (footnoteLabel.test(label))
                    return { end: end + 1, node: { id: -1, kind: 'footnote_reference', span: f.range(start, end + 1), label, labelSpan: f.range(start + 4, end) } };
                if (label.includes(':')) {
                    sink.push({ code: 'unsupported', phase: 'parse', location: { sourceId, span: f.range(start, end + 1) }, message: 'Inline footnote definitions are excluded.', related: [] });
                    return { end: end + 1, node: { id: -1, kind: 'raw_inline', span: f.range(start, end + 1) } };
                }
            }
        }
        if (text.startsWith('<<<', start)) {
            const end = text.indexOf('>>>', start + 3);
            if (end >= 0 && end + 3 <= limit && !text.slice(start, end).includes('\n')) {
                sink.push({ code: 'unsupported', phase: 'parse', location: { sourceId, span: f.range(start, end + 3) }, message: 'Radio targets are excluded.', related: [] });
                return { end: end + 3, node: { id: -1, kind: 'raw_inline', span: f.range(start, end + 3) } };
            }
        }
        if (mode === 'full' && text.startsWith('<<', start) && text[start - 1] !== '<' && text[start + 2] !== '<') {
            const end = text.indexOf('>>', start + 2), name = text.slice(start + 2, end);
            if (end > start + 2 && end + 2 <= limit && !/[<>\n]/.test(name) && !/^[ \t]|[ \t]$/.test(name))
                return {
                    end: end + 2, node: { id: -1, kind: 'target', span: f.range(start, end + 2), name: f.slice(start + 2, end) },
                };
        }
        return null;
    }
    while (jobs.length) {
        const job = jobs.pop(), f = new Fragment(job.value), text = f.text, out = job.output;
        let i = 0, begin = 0;
        const flush = (end) => { if (end > begin)
            out.push(plain(f, begin, end)); begin = end; };
        const schedule = (node) => {
            if (node.kind === 'link' && node.description !== null && node.description.length) {
                const value = node.description[0].value;
                node.description = [];
                jobs.push({ value, mode: 'minimal', markers: job.markers, output: node.description });
            }
        };
        while (i < text.length) {
            const c = text[i], cp = text.codePointAt(i), width = cp > 0xffff ? 2 : 1;
            if (text.startsWith('\r\n', i) || c === '\n') {
                flush(i);
                const end = i + (c === '\r' ? 2 : 1);
                out.push({ id: -1, kind: 'soft_break', span: f.range(i, end) });
                i = begin = end;
                continue;
            }
            const atom = atomic(f, i, text.length, job.mode, diagnostics);
            if (atom) {
                flush(i);
                out.push(atom.node);
                schedule(atom.node);
                i = begin = atom.end;
                continue;
            }
            if (!f.protected(i) && '*_/+'.includes(c) && !job.markers.includes(c) && boundary(before(text, i)) && i + 1 < text.length && !/\s/u.test(after(text, i + 1))) {
                let end = i + 1;
                for (; end < text.length;) {
                    if (text[end] === c && end > i + 1 && !/\s/u.test(before(text, end)) && boundary(after(text, end + 1)))
                        break;
                    const skip = atomic(f, end, text.length, job.mode, []);
                    if (skip)
                        end = skip.end;
                    else
                        end += text.codePointAt(end) > 0xffff ? 2 : 1;
                }
                if (end < text.length) {
                    flush(i);
                    const content = [];
                    out.push({ id: -1, kind: 'emphasis', style: c === '*' ? 'bold' : c === '/' ? 'italic' : c === '_' ? 'underline' : 'strike', span: f.range(i, end + 1), openSpan: f.range(i, i + 1), closeSpan: f.range(end, end + 1), content });
                    jobs.push({ value: f.slice(i + 1, end), mode: job.mode, markers: job.markers + c, output: content });
                    i = begin = end + 1;
                    continue;
                }
            }
            if (!f.protected(i) && (c === '^' || c === '_') && i > 0 && !/\s/u.test(before(text, i))) {
                let end = null, contentStart = i + 1, contentEnd = i + 1, form = 'bare';
                if (text[i + 1] === '{' || text[i + 1] === '(') {
                    end = balanced(text, i + 1, text.length, true);
                    if (end !== null && end > i + 3) {
                        form = text[i + 1] === '{' ? 'brace' : 'paren';
                        contentStart++;
                        contentEnd = end - 1;
                    }
                    else
                        end = null;
                }
                else if (text[i + 1] === '*') {
                    end = i + 2;
                    contentEnd = end;
                    form = 'star';
                }
                else {
                    const m = /^[+-]?[\p{L}\p{Nd},\\.]*[\p{L}\p{Nd}]/u.exec(text.slice(i + 1));
                    if (m) {
                        end = i + 1 + m[0].length;
                        contentEnd = end;
                    }
                }
                if (end !== null) {
                    flush(i);
                    let base = out.pop();
                    if (base && base.kind !== 'soft_break') {
                        if (base.kind === 'text') {
                            const bf = new Fragment(base.value), last = [...bf.text].at(-1);
                            const split = bf.text.length - last.length;
                            if (split)
                                out.push(plain(bf, 0, split));
                            base = plain(bf, split, bf.text.length);
                        }
                        const content = [], part = { id: -1, kind: 'script_part', span: f.range(i, end), position: c === '^' ? 'super' : 'sub', form, content };
                        if (base.kind === 'scripted') {
                            base.parts.push(part);
                            base.span.end = part.span.end;
                            out.push(base);
                        }
                        else
                            out.push({ id: -1, kind: 'scripted', span: { start: base.span.start, end: part.span.end }, base, parts: [part] });
                        jobs.push({ value: f.slice(contentStart, contentEnd), mode: 'minimal', markers: job.markers, output: content });
                        i = begin = end;
                        continue;
                    }
                    if (base)
                        out.push(base);
                }
            }
            if (!f.protected(i) && text.startsWith('[[', i) && job.mode !== 'minimal') {
                report('unclosed', f, i, i + 2, 'Bracket link is not closed.');
                i += 2;
                continue;
            }
            if (!f.protected(i) && text.startsWith('\\(', i))
                report('unclosed', f, i, i + 2, 'Inline formula is not closed.');
            if (text.startsWith('<<<', i)) {
                i += 3;
                continue;
            }
            i += width;
        }
        flush(text.length);
    }
    return result;
}
export function hydrateInline(root, view, diagnostics) {
    const stack = [root];
    while (stack.length) {
        const node = stack.pop();
        let values = null, mode = 'full';
        if (node.kind === 'heading')
            values = node.title;
        else if (node.kind === 'paragraph' || node.kind === 'table_cell')
            values = node.content;
        else if (node.kind === 'caption' || node.kind === 'document_title') {
            values = node.value;
            mode = 'metadata';
        }
        if (values) {
            const fragments = values.map(n => n.kind === 'text' ? n.value : new MappedTextBuilder(view).copy(view.utf16At(n.span.start), view.utf16At(n.span.end)).finish());
            const parsed = parseInline(concatenate(fragments), mode, view.source.id, diagnostics);
            values.splice(0, values.length, ...parsed);
        }
        const next = children(node);
        for (let i = next.length - 1; i >= 0; i--)
            stack.push(next[i]);
    }
}
//# sourceMappingURL=inline.js.map