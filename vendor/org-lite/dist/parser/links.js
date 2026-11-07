import { concatenate, decodeLink, Fragment } from '../source/fragment.js';
import { validateRegexp } from '../analysis/search.js';
export const identifier = /^[\p{L}\p{Nd}_.:\-]+$/u;
export const footnoteLabel = /^[\p{L}\p{Nd}_.\-]+$/u;
export const normalizeName = (text) => text.replace(/^[ \t]+|[ \t]+$/g, '').replace(/[ \t]+/g, ' ');
export function linkAt(f, start, limit, sourceId, diagnostics) {
    const text = f.text;
    let targetEnd = -1, descriptionStart = -1, end = -1;
    for (let i = start + 2; i < limit; i++) {
        if (text[i] === '\\' && /[\[\]\\]/.test(text[i + 1] ?? '')) {
            i++;
            continue;
        }
        if (text[i] === '\n' || text[i] === '\r')
            break;
        if (text[i] === ']' && text[i + 1] === ']') {
            targetEnd = i;
            end = i + 2;
            break;
        }
        if (text[i] === ']' && text[i + 1] === '[') {
            targetEnd = i;
            descriptionStart = i + 2;
            for (let j = descriptionStart; j + 1 < limit; j++) {
                if (text[j] === '\\' && /[\[\]\\]/.test(text[j + 1] ?? '')) {
                    j++;
                    continue;
                }
                if (text[j] === ']' && text[j + 1] === ']') {
                    end = j + 2;
                    break;
                }
            }
            break;
        }
    }
    if (end < 0 || end > limit)
        return null;
    const span = f.range(start, end), raw = f.slice(start + 2, targetEnd), value = decodeLink(raw), targetText = value.text;
    const report = (code, message) => diagnostics.push({ code, phase: 'parse', location: { sourceId, span }, message, related: [] });
    const fail = (code) => {
        report(code, 'Unsupported or invalid bracket link target.');
        return { end, node: { id: -1, kind: 'raw_inline', span } };
    };
    if (!targetText || /^[ \t]|[ \t]$/.test(targetText) || /[\[\]]/.test(raw.text.replace(/\\[\[\]\\]/g, '')))
        return fail('invalid-value');
    const v = new Fragment(value);
    let target;
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(targetText), protocol = scheme?.[1]?.toLowerCase();
    if (protocol === 'http' || protocol === 'https') {
        if (!/^https?:\/\/[^/?#\s\p{Cc}]+(?:[^\s\p{Cc}]*)$/iu.test(targetText))
            return fail('invalid-value');
        target = { kind: 'web', address: value };
    }
    else if (protocol === 'file') {
        const separator = targetText.indexOf('::', 5), pathEnd = separator < 0 ? targetText.length : separator;
        let path = v.slice(5, pathEnd);
        if (!path.text)
            return fail('invalid-value');
        let pathValid = true;
        try {
            const pathFragment = new Fragment(path), chunks = [];
            let begin = 0;
            const re = /(?:%[0-9A-Fa-f]{2})+/g;
            let m;
            if (/%(?![0-9A-Fa-f]{2})/.test(path.text))
                throw new Error('Invalid percent escape');
            while ((m = re.exec(path.text))) {
                if (m.index > begin)
                    chunks.push(pathFragment.slice(begin, m.index));
                const decoded = decodeURIComponent(m[0]);
                chunks.push({ text: decoded, pieces: [{ output: { start: 0, end: new TextEncoder().encode(decoded).length }, source: pathFragment.range(m.index, m.index + m[0].length), mode: 'replace' }] });
                begin = m.index + m[0].length;
            }
            if (begin < path.text.length)
                chunks.push(pathFragment.slice(begin, path.text.length));
            path = concatenate(chunks);
        }
        catch {
            pathValid = false;
            report('invalid-value', 'Invalid UTF-8 percent encoding in file path.');
        }
        let selector = null;
        if (separator >= 0) {
            const select = v.slice(separator + 2, targetText.length), sf = new Fragment(select), s = select.text;
            if (/^[0-9]+$/.test(s) && BigInt(s) > 0n)
                selector = { kind: 'line', value: select };
            else if (s.startsWith('*') && normalizeName(s.slice(1)))
                selector = { kind: 'heading', value: sf.slice(1, s.length) };
            else if (s.startsWith('#') && identifier.test(s.slice(1)))
                selector = { kind: 'custom_id', value: sf.slice(1, s.length) };
            else if (s.startsWith('/') && s.endsWith('/') && s.length > 2 && validateRegexp(s.slice(1, -1)))
                selector = { kind: 'regexp', value: sf.slice(1, s.length - 1) };
            else if (s && !/^[0-9]+$/.test(s) && !/^[*#/]/.test(s))
                selector = { kind: 'text', value: select };
            else {
                selector = { kind: 'invalid', value: select };
                report('invalid-value', 'Invalid file search selector.');
            }
        }
        target = { kind: 'file', path, pathValid, selector };
    }
    else if (protocol === 'id') {
        if (!identifier.test(targetText.slice(3)))
            return fail('invalid-value');
        target = { kind: 'id', value: v.slice(3, targetText.length) };
    }
    else if (scheme)
        return fail('unsupported');
    else if (targetText.startsWith('#')) {
        if (!identifier.test(targetText.slice(1)))
            return fail('invalid-value');
        target = { kind: 'custom_id', value: v.slice(1, targetText.length) };
    }
    else if (targetText.startsWith('*'))
        target = { kind: 'heading', value: v.slice(1, targetText.length) };
    else
        target = { kind: 'local_name', value };
    let description = null;
    if (descriptionStart >= 0) {
        if (text.slice(descriptionStart, end - 2).includes('[['))
            return fail('invalid-value');
        const decoded = decodeLink(f.slice(descriptionStart, end - 2)), df = new Fragment(decoded);
        description = decoded.text ? [{ id: -1, kind: 'text', span: df.range(0, df.text.length), value: decoded }] : [];
    }
    return { end, node: { id: -1, kind: 'link', span, targetSpan: f.range(start + 2, targetEnd), target: target, description,
            imageCandidate: description === null && target.kind === 'file' && target.selector === null && /\.(png|jpe?g|gif|svg|webp|bmp|tiff?|avif)$/i.test(target.path.text) } };
}
//# sourceMappingURL=links.js.map