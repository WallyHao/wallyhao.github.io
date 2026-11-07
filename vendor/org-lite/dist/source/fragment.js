const encoder = new TextEncoder();
export function concatenate(values) {
    let text = "", length = 0;
    const pieces = [];
    for (const value of values) {
        text += value.text;
        for (const p of value.pieces)
            pieces.push({ output: { start: p.output.start + length, end: p.output.end + length }, source: { ...p.source }, mode: p.mode });
        length += encoder.encode(value.text).length;
    }
    return { text, pieces };
}
/** An interpreted fragment with a lossless path back to original UTF-8 ranges. */
export class Fragment {
    value;
    text;
    offsets = [0];
    constructor(value) {
        this.value = value;
        this.text = value.text;
        let byte = 0;
        for (const char of value.text) {
            const width = encoder.encode(char).length;
            if (char.length === 2)
                this.offsets.push(-1);
            byte += width;
            this.offsets.push(byte);
        }
    }
    byteAt(index) { const n = this.offsets[index]; if (n === undefined || n < 0)
        throw new Error("Invalid fragment boundary"); return n; }
    slice(start, end) {
        const a = this.byteAt(start), b = this.byteAt(end);
        const pieces = [];
        for (const p of this.value.pieces) {
            const lo = Math.max(a, p.output.start), hi = Math.min(b, p.output.end);
            if (lo >= hi)
                continue;
            pieces.push({ output: { start: lo - a, end: hi - a }, source: p.mode === "copy" ?
                    { start: p.source.start + lo - p.output.start, end: p.source.start + hi - p.output.start } : { ...p.source }, mode: p.mode });
        }
        return { text: this.text.slice(start, end), pieces };
    }
    range(start, end) {
        const value = this.slice(start, end), first = value.pieces[0], last = value.pieces.at(-1);
        if (first && last)
            return { start: first.source.start, end: last.source.end };
        const byte = this.byteAt(start), p = this.value.pieces.find(p => p.output.start <= byte && p.output.end >= byte);
        const at = p ? p.mode === "copy" ? p.source.start + byte - p.output.start : p.source.start : this.value.pieces.at(-1)?.source.end ?? 0;
        return { start: at, end: at };
    }
    protected(index) {
        const byte = this.byteAt(index);
        return this.value.pieces.some(p => p.mode === "replace" && p.output.start <= byte && byte < p.output.end);
    }
}
export function decodeLink(value) {
    const f = new Fragment(value), chunks = [];
    let start = 0;
    for (let i = 0; i < f.text.length; i++) {
        if (f.text[i] === "\\" && /[\[\]\\]/.test(f.text[i + 1] ?? "")) {
            if (i > start)
                chunks.push(f.slice(start, i));
            const text = f.text[i + 1];
            chunks.push({ text, pieces: [{ output: { start: 0, end: 1 }, source: f.range(i, i + 2), mode: "replace" }] });
            i++;
            start = i + 1;
        }
    }
    if (start < f.text.length)
        chunks.push(f.slice(start, f.text.length));
    return concatenate(chunks);
}
export function trimHorizontal(value) {
    const f = new Fragment(value), start = /^[ \t]*/.exec(f.text)[0].length;
    const end = f.text.length - /[ \t]*$/.exec(f.text)[0].length;
    return f.slice(start, Math.max(start, end));
}
//# sourceMappingURL=fragment.js.map