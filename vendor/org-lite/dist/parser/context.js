export function bodyState(body) {
    return { body, paragraph: null, lastLine: null, pending: [], pendingColumn: 0 };
}
export function flush(state) { state.paragraph = null; state.lastLine = null; }
export function textNode(value) {
    const first = value.pieces[0], last = value.pieces.at(-1);
    if (!first || !last)
        return null;
    return { id: -1, kind: "text", span: { start: first.source.start, end: last.source.end }, value: {
            text: value.text, pieces: value.pieces.map(p => ({ output: { ...p.output }, source: { ...p.source }, mode: p.mode })),
        } };
}
export function appendParagraph(state, value, line) {
    const text = textNode(value);
    if (!text)
        return;
    if (state.paragraph) {
        const previous = state.lastLine;
        state.paragraph.content.push({ id: -1, kind: "soft_break", span: {
                start: previous.contentEndByte, end: previous.endByte,
            } });
        state.paragraph.content.push(text);
        state.paragraph.span.end = line.endByte;
    }
    else {
        state.paragraph = { id: -1, kind: "paragraph", span: { start: text.span.start, end: line.endByte },
            affiliations: [], content: [text] };
        state.body.push(state.paragraph);
    }
    state.lastLine = line;
}
//# sourceMappingURL=context.js.map