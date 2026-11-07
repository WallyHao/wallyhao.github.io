function compile(pattern) {
    const chars = [...pattern];
    let id = 0, at = 0;
    const groups = [{ sequence: [], branches: [] }];
    const make = (fields) => ({ id: id++, ...fields });
    const sequence = (values) => values.length === 1 ? values[0] : make({ kind: 'sequence', parts: values });
    const group = (g) => { if (!g.sequence.length)
        return null; const parts = [...g.branches, sequence(g.sequence)]; return parts.length === 1 ? parts[0] : make({ kind: 'alternative', parts }); };
    const escaped = () => {
        const c = chars[at++];
        if (c === undefined)
            return null;
        return c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : '^$.|?*+()[]{}\\-'.includes(c) ? c : null;
    };
    while (at < chars.length) {
        let c = chars[at++], atom;
        if (c === '(') {
            groups.push({ sequence: [], branches: [] });
            continue;
        }
        if (c === '|') {
            const g = groups.at(-1);
            if (!g.sequence.length)
                return null;
            g.branches.push(sequence(g.sequence));
            g.sequence = [];
            continue;
        }
        if (c === ')') {
            if (groups.length === 1)
                return null;
            const value = group(groups.pop());
            if (!value)
                return null;
            atom = make({ kind: 'sequence', parts: [value] });
        }
        else if (c === '\\') {
            const value = escaped();
            if (value === null)
                return null;
            atom = make({ kind: 'char', char: value });
        }
        else if (c === '[') {
            const negate = chars[at] === '^';
            if (negate)
                at++;
            const tokens = [];
            while (at < chars.length && chars[at] !== ']') {
                const value = chars[at++];
                if (value === '[')
                    return null;
                if (value === '\\') {
                    const decoded = escaped();
                    if (decoded === null)
                        return null;
                    tokens.push({ value: decoded, escaped: true });
                }
                else
                    tokens.push({ value, escaped: false });
            }
            if (!tokens.length || chars[at++] !== ']')
                return null;
            const ranges = [];
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i], next = tokens[i + 1];
                if (next?.value === '-' && !next.escaped && i + 2 < tokens.length) {
                    const a = token.value.codePointAt(0), b = tokens[i + 2].value.codePointAt(0);
                    if (a > b || tokens[i + 2].value === '-')
                        return null;
                    ranges.push([a, b]);
                    i += 2;
                }
                else {
                    if (token.value === '-' && !token.escaped && i > 0 && i < tokens.length - 1)
                        return null;
                    const point = token.value.codePointAt(0);
                    ranges.push([point, point]);
                }
            }
            atom = make({ kind: 'class', ranges, negate });
        }
        else if (c === '.' || c === '^' || c === '$')
            atom = make({ kind: c === '.' ? 'dot' : c === '^' ? 'start' : 'end' });
        else {
            if ('*+?{}]'.includes(c))
                return null;
            atom = make({ kind: 'char', char: c });
        }
        c = chars[at] ?? '';
        if (c && '*+?{'.includes(c)) {
            if (atom.kind === 'start' || atom.kind === 'end')
                return null;
            let min = 0n, max = null;
            at++;
            if (c === '+')
                min = 1n;
            else if (c === '?')
                max = 1n;
            else if (c === '{') {
                let count = '';
                while (/[0-9]/.test(chars[at] ?? ''))
                    count += chars[at++];
                if (!count)
                    return null;
                min = BigInt(count);
                max = min;
                if (chars[at] === ',') {
                    at++;
                    let upper = '';
                    while (/[0-9]/.test(chars[at] ?? ''))
                        upper += chars[at++];
                    max = upper ? BigInt(upper) : null;
                }
                if (chars[at++] !== '}' || (max !== null && min > max))
                    return null;
            }
            atom = make({ kind: 'repeat', child: atom, min, max });
            if (chars[at] && '*+?{'.includes(chars[at]))
                return null;
        }
        groups.at(-1).sequence.push(atom);
    }
    return groups.length === 1 ? group(groups[0]) : null;
}
export function validateRegexp(pattern) { return compile(pattern) !== null; }
/** Finite position-set interpreter: no JS RegExp matching semantics or recursive evaluator. */
function evaluator(chars) {
    const memo = new Map();
    const frame = (node, start) => ({ node, start, index: 0, positions: new Set([start]), next: new Set(), queue: [start], cursor: 0, count: 0n, accepted: new Set(node.kind === 'repeat' && node.min === 0n ? [start] : []) });
    const key = (n, p) => `${n.id}:${p}`;
    return (node, start) => {
        const stack = [frame(node, start)];
        const finish = (f, values) => { memo.set(key(f.node, f.start), values); stack.pop(); };
        while (stack.length) {
            const f = stack.at(-1), n = f.node;
            if (memo.has(key(n, f.start))) {
                stack.pop();
                continue;
            }
            if (n.kind === 'char' || n.kind === 'class' || n.kind === 'dot' || n.kind === 'start' || n.kind === 'end') {
                const c = chars[f.start], cp = c?.codePointAt(0);
                const matches = n.kind === 'char' ? c === n.char : n.kind === 'dot' ? c !== undefined && c !== '\n' : n.kind === 'start' ? f.start === 0 || chars[f.start - 1] === '\n' : n.kind === 'end' ? f.start === chars.length || c === '\n' :
                    cp !== undefined && (n.ranges.some(([a, b]) => a <= cp && cp <= b) !== !!n.negate);
                finish(f, new Set(matches ? [n.kind === 'start' || n.kind === 'end' ? f.start : f.start + 1] : []));
                continue;
            }
            if (n.kind === 'alternative') {
                if (f.index === n.parts.length) {
                    finish(f, f.accepted);
                    continue;
                }
                const child = n.parts[f.index], result = memo.get(key(child, f.start));
                if (!result) {
                    stack.push(frame(child, f.start));
                    continue;
                }
                for (const p of result)
                    f.accepted.add(p);
                f.index++;
                continue;
            }
            if (n.kind === 'sequence') {
                if (f.index === n.parts.length || !f.positions.size) {
                    finish(f, f.positions);
                    continue;
                }
                if (f.cursor < f.queue.length) {
                    const p = f.queue[f.cursor], child = n.parts[f.index], result = memo.get(key(child, p));
                    if (!result) {
                        stack.push(frame(child, p));
                        continue;
                    }
                    for (const end of result)
                        f.next.add(end);
                    f.cursor++;
                    continue;
                }
                f.positions = f.next;
                f.next = new Set();
                f.queue = [...f.positions];
                f.cursor = 0;
                f.index++;
                continue;
            }
            if (n.max !== null && f.count >= n.max) {
                finish(f, f.accepted);
                continue;
            }
            if (f.cursor < f.queue.length) {
                const p = f.queue[f.cursor], result = memo.get(key(n.child, p));
                if (!result) {
                    stack.push(frame(n.child, p));
                    continue;
                }
                for (const end of result)
                    f.next.add(end);
                f.cursor++;
                continue;
            }
            f.count++;
            if (f.count >= n.min)
                for (const p of f.next)
                    f.accepted.add(p);
            const stable = f.next.size === f.positions.size && [...f.next].every(p => f.positions.has(p));
            if (stable || !f.next.size) {
                if (stable && (n.max === null || n.max >= n.min))
                    for (const p of f.next)
                        f.accepted.add(p);
                finish(f, f.accepted);
                continue;
            }
            f.positions = f.next;
            f.next = new Set();
            f.queue = [...f.positions];
            f.cursor = 0;
        }
        return memo.get(key(node, start));
    };
}
export function regexpSearch(text, pattern) {
    const expression = compile(pattern);
    if (!expression)
        return null;
    const chars = [], offsets = [0];
    let byte = 0;
    const input = [...text];
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === '\r' && input[i + 1] === '\n') {
            chars.push('\n');
            byte += 2;
            i++;
        }
        else {
            chars.push(c);
            byte += new TextEncoder().encode(c).length;
        }
        offsets.push(byte);
    }
    const evaluate = evaluator(chars);
    for (let start = 0; start <= chars.length; start++) {
        const ends = evaluate(expression, start);
        if (!ends.size)
            continue;
        let end = start;
        for (const value of ends)
            end = Math.max(end, value);
        return { start: offsets[start], end: offsets[end] };
    }
    return null;
}
//# sourceMappingURL=search.js.map