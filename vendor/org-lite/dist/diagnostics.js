export function diagnostic(source, code, span, message) {
    return { code, phase: "parse", location: { sourceId: source.id, span }, message, related: [] };
}
const encoder = new TextEncoder();
export function compareUtf8(a, b) {
    if (a === b)
        return 0;
    const left = encoder.encode(a), right = encoder.encode(b);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        if (left[i] !== right[i])
            return left[i] - right[i];
    }
    return left.length - right.length;
}
export function sortDiagnostics(values) {
    const ordered = values.map(value => ({ ...value, related: [...value.related].sort((a, b) => compareUtf8(a.location.sourceId, b.location.sourceId) || a.location.span.start - b.location.span.start || a.location.span.end - b.location.span.end) })).sort((a, b) => compareUtf8(a.location.sourceId, b.location.sourceId) ||
        a.location.span.start - b.location.span.start || a.location.span.end - b.location.span.end ||
        compareUtf8(a.code, b.code) || compareUtf8(a.phase, b.phase));
    const seen = new Set();
    return ordered.filter(value => {
        const key = JSON.stringify([value.code, value.phase, value.location, value.related.map(r => r.location)]);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=diagnostics.js.map