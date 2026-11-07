import { validateUnicode } from "./utf8.js";
export class MappedTextBuilder {
    chunks = [];
    pieces = [];
    length = 0;
    view;
    constructor(view) { this.view = view; }
    copy(start, end) {
        if (start === end)
            return this;
        return this.append(this.view.source.text.slice(start, end), this.view.range(start, end), "copy");
    }
    replace(text, source) {
        if (!text.length)
            return this;
        return this.append(text, source, "replace");
    }
    append(text, source, mode) {
        const valid = validateUnicode(text);
        if (!valid.ok || source.start >= source.end)
            throw new Error("Invalid mapped-text segment.");
        const previous = this.pieces.at(-1);
        if (previous && source.start < previous.source.end)
            throw new Error("Mapped text must follow source order.");
        const output = { start: this.length, end: this.length + valid.value };
        if (previous?.mode === "copy" && mode === "copy" && previous.source.end === source.start) {
            this.pieces[this.pieces.length - 1] = {
                output: { start: previous.output.start, end: output.end },
                source: { start: previous.source.start, end: source.end }, mode,
            };
        }
        else
            this.pieces.push({ output, source, mode });
        this.chunks.push(text);
        this.length = output.end;
        return this;
    }
    finish() { return { text: this.chunks.join(""), pieces: this.pieces.slice() }; }
}
/** Remove physical indentation up to a column, preserving any remainder of a tab. */
export function lineValue(view, line, cutColumn) {
    const result = new MappedTextBuilder(view);
    let index = line.start, column = 0;
    while (index < line.indentEnd && column < cutColumn) {
        const endColumn = view.source.text[index] === "\t" ? column + 8 - column % 8 : column + 1;
        if (endColumn > cutColumn)
            result.replace(" ".repeat(endColumn - cutColumn), view.range(index, index + 1));
        column = endColumn;
        index++;
    }
    return result.copy(index, line.contentEnd).finish();
}
//# sourceMappingURL=mapped-text.js.map