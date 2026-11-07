import { scalarWidth, validateUnicode } from "./utf8.js";
function preceding(values, target, key) {
    let lo = 0, hi = values.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (key(values[mid]) <= target)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo - 1;
}
/** Private parsing view: UTF-16 is confined here, public ranges always use UTF-8. */
export class SourceView {
    source;
    byteLength;
    lines;
    checkpoints;
    constructor(source, byteLength) {
        this.source = source;
        this.byteLength = byteLength;
        const text = source.text;
        const checkpoints = [{ utf16: 0, byte: 0, scalar: 0 }];
        const lines = [];
        let byte = 0, scalar = 0, start = 0, startByte = 0, scalarStart = 0;
        const addLine = (contentEnd, end, contentEndByte, endByte, scalarEnd) => {
            let indentEnd = start, indentColumns = 0;
            while (indentEnd < contentEnd) {
                const c = text[indentEnd];
                if (c === " ")
                    indentColumns++;
                else if (c === "\t")
                    indentColumns += 8 - indentColumns % 8;
                else
                    break;
                indentEnd++;
            }
            lines.push({ start, contentEnd, end, startByte, contentEndByte, endByte,
                scalarStart, scalarEnd, indentEnd, indentColumns, blank: indentEnd === contentEnd });
        };
        for (let i = 0; i < text.length;) {
            const cp = text.codePointAt(i);
            const length = cp > 0xffff ? 2 : 1;
            if (cp === 10) {
                const crlf = i > 0 && text[i - 1] === "\r";
                addLine(i - (crlf ? 1 : 0), i + 1, byte - (crlf ? 1 : 0), byte + 1, scalar - (crlf ? 1 : 0));
                start = i + 1;
                startByte = byte + 1;
                scalarStart = scalar + 1;
            }
            byte += scalarWidth(cp);
            scalar++;
            i += length;
            if (scalar % 128 === 0 || cp === 10)
                checkpoints.push({ utf16: i, byte, scalar });
        }
        addLine(text.length, text.length, byte, byte, scalar);
        this.checkpoints = checkpoints;
        this.lines = lines;
    }
    checkpointAt(index) {
        return this.checkpoints[Math.max(0, index)];
    }
    isBoundary(index) {
        const text = this.source.text;
        if (index > 0 && text[index - 1] === "\r" && text[index] === "\n")
            return false;
        const unit = text.charCodeAt(index);
        return !(unit >= 0xdc00 && unit <= 0xdfff);
    }
    byteAt(utf16) {
        if (!Number.isSafeInteger(utf16) || utf16 < 0 || utf16 > this.source.text.length || !this.isBoundary(utf16)) {
            throw new RangeError("Internal offset is not a valid source boundary.");
        }
        const c = this.checkpointAt(preceding(this.checkpoints, utf16, p => p.utf16));
        let byte = c.byte;
        for (let i = c.utf16; i < utf16;) {
            const cp = this.source.text.codePointAt(i);
            byte += scalarWidth(cp);
            i += cp > 0xffff ? 2 : 1;
        }
        return byte;
    }
    atByte(offset) {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.byteLength)
            return null;
        const c = this.checkpointAt(preceding(this.checkpoints, offset, p => p.byte));
        let { utf16, byte, scalar } = c;
        while (byte < offset) {
            const cp = this.source.text.codePointAt(utf16);
            byte += scalarWidth(cp);
            utf16 += cp > 0xffff ? 2 : 1;
            scalar++;
        }
        return byte === offset && this.isBoundary(utf16) ? { utf16, byte, scalar } : null;
    }
    utf16At(offset) { return this.atByte(offset)?.utf16 ?? null; }
    position(offset) {
        const at = this.atByte(offset);
        if (!at)
            return null;
        const line = Math.max(0, preceding(this.lines, offset, p => p.startByte));
        return { line, column: at.scalar - this.lines[line].scalarStart };
    }
    offset(position) {
        if (!Number.isSafeInteger(position.line) || !Number.isSafeInteger(position.column) || position.line < 0 || position.column < 0)
            return null;
        const line = this.lines[position.line];
        if (!line || position.column > line.scalarEnd - line.scalarStart)
            return null;
        const target = line.scalarStart + position.column;
        const c = this.checkpointAt(preceding(this.checkpoints, target, p => p.scalar));
        let { utf16, byte, scalar } = c;
        while (scalar < target) {
            const cp = this.source.text.codePointAt(utf16);
            byte += scalarWidth(cp);
            utf16 += cp > 0xffff ? 2 : 1;
            scalar++;
        }
        return byte;
    }
    range(start, end) { return { start: this.byteAt(start), end: this.byteAt(end) }; }
}
const cached = new WeakMap();
export function createSourceView(input) {
    if (!input || typeof input.id !== "string" || !input.id.length) {
        return { ok: false, error: { code: "invalid-source-id", message: "Source id must be a nonempty string." } };
    }
    if (typeof input.text !== "string") {
        return { ok: false, error: { code: "invalid-unicode", message: "Source text must be a Unicode string." } };
    }
    const valid = validateUnicode(input.text);
    if (!valid.ok)
        return valid;
    const source = { id: input.id, text: input.text, origin: input.origin };
    return { ok: true, value: new SourceView(source, valid.value) };
}
export function cacheSourceView(view) { cached.set(view.source, view); }
function viewFor(source) {
    const existing = cached.get(source);
    if (existing)
        return existing;
    const made = createSourceView(source);
    if (!made.ok)
        return null;
    // Mutable caller objects must never retain a stale cached view.
    if (Object.isFrozen(source))
        cached.set(source, made.value);
    return made.value;
}
const positionError = (code) => ({
    ok: false, error: { code, message: "Position must be within the source and on a Unicode/CRLF boundary." },
});
export function slice(source, span) {
    const view = viewFor(source);
    if (!view || span.start > span.end)
        return positionError("invalid-span");
    const start = view.utf16At(span.start), end = view.utf16At(span.end);
    return start === null || end === null ? positionError("invalid-span") :
        { ok: true, value: source.text.slice(start, end) };
}
export function positionAt(source, offset) {
    const position = viewFor(source)?.position(offset);
    return position ? { ok: true, value: position } : positionError("invalid-offset");
}
export function offsetAt(source, position) {
    const offset = viewFor(source)?.offset(position);
    return offset === null || offset === undefined ? positionError("invalid-position") : { ok: true, value: offset };
}
//# sourceMappingURL=source.js.map