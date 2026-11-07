export function scalarWidth(codePoint) {
    return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}
/** Validate before TextEncoder can replace isolated UTF-16 surrogates. */
export function validateUnicode(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = text.charCodeAt(i + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff))
                return invalidUnicode();
            bytes += 4;
            i++;
        }
        else if (unit >= 0xdc00 && unit <= 0xdfff) {
            return invalidUnicode();
        }
        else {
            bytes += scalarWidth(unit);
        }
        if (!Number.isSafeInteger(bytes)) {
            return { ok: false, error: { code: "input-too-large", message: "UTF-8 length exceeds safe offsets." } };
        }
    }
    return { ok: true, value: bytes };
}
function invalidUnicode() {
    return { ok: false, error: { code: "invalid-unicode", message: "Input contains an unpaired UTF-16 surrogate." } };
}
/** First ill-formed UTF-8 subsequence (valid prefix, excluding a following non-continuation). */
export function decodeUtf8(bytes) {
    const fail = (start, end) => ({
        ok: false, error: {
            code: "invalid-utf8", byteSpan: { start, end }, message: "Input contains an invalid UTF-8 sequence.",
        },
    });
    for (let i = 0; i < bytes.length;) {
        const lead = bytes[i];
        if (lead < 0x80) {
            i++;
            continue;
        }
        const width = lead >= 0xc2 && lead <= 0xdf ? 2 :
            lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
        if (!width)
            return fail(i, i + 1);
        for (let j = 1; j < width; j++) {
            if (i + j >= bytes.length)
                return fail(i, bytes.length);
            const b = bytes[i + j];
            if (b < 0x80 || b > 0xbf)
                return fail(i, i + j);
            if (j === 1 && ((lead === 0xe0 && b < 0xa0) || (lead === 0xed && b > 0x9f) ||
                (lead === 0xf0 && b < 0x90) || (lead === 0xf4 && b > 0x8f)))
                return fail(i, i + 1);
        }
        i += width;
    }
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
}
//# sourceMappingURL=utf8.js.map