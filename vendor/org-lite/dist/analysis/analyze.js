import { children, deepFreeze } from '../tree.js';
import { compareUtf8, sortDiagnostics } from '../diagnostics.js';
import { createSourceView } from '../source/source.js';
import { identifier, normalizeName } from '../parser/links.js';
import { regexpSearch, validateRegexp } from './search.js';
const walk = function* (root) { const stack = [root]; while (stack.length) {
    const node = stack.pop();
    yield node;
    const next = children(node);
    for (let i = next.length - 1; i >= 0; i--)
        stack.push(next[i]);
} };
function equal(a, b) {
    const pairs = [[a, b]];
    while (pairs.length) {
        const [x, y] = pairs.pop();
        if (x === y)
            continue;
        if (!x || !y || typeof x !== 'object' || typeof y !== 'object' || Array.isArray(x) !== Array.isArray(y))
            return false;
        const keys = Object.keys(x);
        if (keys.length !== Object.keys(y).length)
            return false;
        for (const key of keys) {
            if (!Object.hasOwn(y, key))
                return false;
            pairs.push([x[key], y[key]]);
        }
    }
    return true;
}
const location = (definition) => ({ sourceId: definition.parsed.source.id, span: definition.declaration.span });
const destination = (d) => ({ kind: 'node', sourceId: d.parsed.source.id, nodeId: d.node.id, span: d.node.span });
function ordered(values) {
    return [...values].sort((a, b) => compareUtf8(a.parsed.source.id, b.parsed.source.id) || a.node.span.start - b.node.span.start || a.node.span.end - b.node.span.end || a.node.id - b.node.id);
}
function headingName(view, node) {
    return normalizeName(view.source.text.slice(view.utf16At(node.headlineSpan.start), view.utf16At(node.headlineSpan.end)).replace(/\r?\n$/, '').replace(/^\*+[ \t]+/, ''));
}
export function analyze(parsed, context = { documents: [], idScopeComplete: false, files: [] }) {
    const documents = new Map(), sources = new Map(), resources = new Map(), files = new Map();
    const views = new Map();
    let error = null;
    const bad = (code, message) => { error ??= { code, message }; };
    const addSource = (source) => {
        const existing = sources.get(source.id);
        if (existing && !equal(existing, source))
            bad('duplicate-source', `Conflicting snapshot for ${source.id}.`);
        else
            sources.set(source.id, source);
        const view = createSourceView(source);
        if (!view.ok)
            bad('inconsistent-resource', 'Resource contains an invalid source snapshot.');
        else
            views.set(source.id, view.value);
    };
    const addDocument = (doc) => {
        if (doc.modelVersion !== '0.1' || doc.syntaxVersion !== '0.1')
            bad('version-mismatch', 'Only v0.1 parse results can be analyzed together.');
        addSource(doc.source);
        const existing = documents.get(doc.source.id);
        if (existing && !equal(existing, doc))
            bad('duplicate-source', `Conflicting parse result for ${doc.source.id}.`);
        else
            documents.set(doc.source.id, doc);
    };
    addDocument(parsed);
    for (const doc of context.documents)
        addDocument(doc);
    for (const binding of context.files) {
        const key = JSON.stringify([binding.from, binding.path]);
        if (files.has(key))
            bad('duplicate-file-binding', 'Each file binding must have a unique from/path pair.');
        files.set(key, binding);
        if (binding.result.state === 'available') {
            const r = binding.result.resource;
            if (!r.key || (resources.has(r.key) && !equal(resources.get(r.key), r)))
                bad('inconsistent-resource', 'Resource keys must refer to consistent nonempty resources.');
            resources.set(r.key, r);
            if (r.kind === 'document')
                addDocument(r.parsed);
            else if (r.kind === 'text')
                addSource(r.source);
        }
    }
    if (error)
        return { ok: false, error };
    const diagnostics = [...parsed.diagnostics];
    const report = (doc, node, code, message, related = []) => {
        if (doc.source.id !== parsed.source.id)
            return;
        diagnostics.push({ code, phase: 'analyze', location: { sourceId: doc.source.id, span: node.span }, message, related: related.map(d => ({ location: location(d), message: 'Related definition.' })) });
    };
    const indices = new Map(), globalIds = new Map();
    for (const doc of documents.values()) {
        const index = { parsed: doc, titles: new Map(), targets: new Map(), names: new Map(), ids: new Map(), custom: new Map(), notes: new Map() };
        indices.set(doc.source.id, index);
        const register = (map, key, node, declaration = node) => {
            const values = map.get(key) ?? [], def = { parsed: doc, node, declaration };
            if (values.length)
                report(doc, declaration, 'duplicate', 'Duplicate declaration.', [values[0]]);
            values.push(def);
            map.set(key, values);
        };
        const owners = new Map();
        let firstTitle = null;
        for (const node of walk(doc.document)) {
            if (node.kind === 'heading') {
                register(index.titles, headingName(views.get(doc.source.id), node), node);
                if (node.properties)
                    owners.set(node.properties, node);
            }
            if (node.kind === 'target')
                register(index.targets, normalizeName(node.name.text), node);
            if (node.kind === 'footnote_definition')
                register(index.notes, node.label, node);
            if (node.kind === 'document_title') {
                if (firstTitle)
                    report(doc, node, 'duplicate', 'Only the first document TITLE is effective.', [{ node: firstTitle, declaration: firstTitle, parsed: doc }]);
                else
                    firstTitle = node;
            }
            if (node.kind === 'property_drawer') {
                const first = new Map();
                for (const entry of node.entries) {
                    const previous = first.get(entry.key);
                    if (previous) {
                        report(doc, entry, 'duplicate', 'Duplicate property key.', [{ node: previous, declaration: previous, parsed: doc }]);
                        continue;
                    }
                    first.set(entry.key, entry);
                    if (entry.key !== 'ID' && entry.key !== 'CUSTOM_ID')
                        continue;
                    if (!identifier.test(entry.value.text)) {
                        report(doc, entry, 'invalid-value', 'ID properties require a nonempty identifier.');
                        continue;
                    }
                    const owner = owners.get(node);
                    if (owner) {
                        register(entry.key === 'ID' ? index.ids : index.custom, entry.value.text, owner, entry);
                        if (entry.key === 'ID') {
                            const values = globalIds.get(entry.value.text) ?? [];
                            values.push({ node: owner, declaration: entry, parsed: doc });
                            globalIds.set(entry.value.text, values);
                        }
                    }
                }
            }
            if ('affiliations' in node) {
                const first = new Map();
                for (const a of node.affiliations) {
                    const previous = first.get(a.kind);
                    if (previous) {
                        report(doc, a, 'duplicate', 'Duplicate affiliated keyword.', [{ node: previous, declaration: previous, parsed: doc }]);
                        continue;
                    }
                    first.set(a.kind, a);
                    if (a.kind === 'name') {
                        const name = normalizeName(a.value.text);
                        if (!name || /[\[\]<>]/.test(name))
                            report(doc, a, 'invalid-value', 'Invalid NAME value.');
                        else
                            register(index.names, name, node, a);
                    }
                }
            }
            if (node.kind === 'table') {
                const alignments = new Map(), widths = new Map();
                for (const row of node.rows)
                    if (row.kind === 'table_row')
                        row.cells.forEach((cell, column) => {
                            if (!cell.format)
                                return;
                            for (const [value, map] of [[cell.format.alignment, alignments], [cell.format.width, widths]]) {
                                if (value === null)
                                    continue;
                                const previous = map.get(column);
                                if (previous && previous.value !== value)
                                    report(doc, cell, 'duplicate', 'Conflicting column format.', [{ node: previous.node, declaration: previous.node, parsed: doc }]);
                                else if (!previous)
                                    map.set(column, { value, node: cell });
                            }
                        });
            }
        }
    }
    for (const definitions of globalIds.values()) {
        const sorted = ordered(definitions);
        for (let i = 1; i < sorted.length; i++)
            if (sorted[i].parsed.source.id !== sorted[0].parsed.source.id)
                report(sorted[i].parsed, sorted[i].declaration, 'duplicate', 'Duplicate ID across documents.', [sorted[0]]);
    }
    const local = indices.get(parsed.source.id);
    const references = [];
    const state = (status, reason = null, targets = []) => ({ status, targets, reason });
    const candidates = (values, pending = false, first = false) => {
        if (!values?.length)
            return state(pending ? 'pending' : 'unresolved', pending ? 'Candidate documents are not yet complete.' : 'No matching target.');
        const sorted = ordered(first ? [values[0]] : values);
        return state(sorted.length > 1 ? 'ambiguous' : 'resolved', sorted.length > 1 ? 'Multiple matching definitions.' : null, sorted.map(destination));
    };
    const named = (index, text) => index.targets.get(normalizeName(text)) ?? index.names.get(normalizeName(text)) ?? index.titles.get(normalizeName(text));
    const textDestination = (source, span) => state('resolved', null, [{ kind: 'range', sourceId: source.id, span }]);
    const search = (resource, selector) => {
        if (selector.kind === 'invalid')
            return state('invalid', 'Invalid file selector.');
        if (resource.kind === 'opaque')
            return state('pending', 'Searchable file contents have not been provided.');
        const source = resource.kind === 'document' ? resource.parsed.source : resource.source;
        const index = resource.kind === 'document' ? indices.get(source.id) : null;
        if (selector.kind === 'heading')
            return index ? candidates(index.titles.get(normalizeName(selector.value.text))) : state('invalid', 'Heading search requires a parsed document.');
        if (selector.kind === 'custom_id')
            return index ? candidates(index.custom.get(selector.value.text)) : state('invalid', 'CUSTOM_ID search requires a parsed document.');
        if (selector.kind === 'line') {
            const view = createSourceView(source);
            if (!view.ok)
                return state('invalid', 'Invalid text source.');
            const number = BigInt(selector.value.text);
            if (number < 1n || number > BigInt(view.value.lines.length))
                return state('invalid', 'Line number is outside the supplied file.');
            const at = view.value.lines[Number(number) - 1].startByte;
            return textDestination(source, { start: at, end: at });
        }
        if (selector.kind === 'regexp') {
            if (!validateRegexp(selector.value.text))
                return state('invalid', 'Invalid regular-expression subset.');
            const span = regexpSearch(source.text, selector.value.text);
            return span ? textDestination(source, span) : state('unresolved', 'Pattern has no match.');
        }
        if (index) {
            const targets = named(index, selector.value.text);
            if (targets?.length)
                return candidates(targets);
        }
        const at = source.text.indexOf(selector.value.text);
        if (at < 0)
            return state('unresolved', 'Search text has no match.');
        const start = new TextEncoder().encode(source.text.slice(0, at)).length;
        return textDestination(source, { start, end: start + new TextEncoder().encode(selector.value.text).length });
    };
    const resolveLink = (node) => {
        const t = node.target;
        if (t.kind === 'web')
            return state('resolved', null, [{ kind: 'web', address: t.address.text }]);
        if (t.kind === 'id')
            return candidates(globalIds.get(t.value.text), !context.idScopeComplete);
        if (t.kind === 'heading')
            return candidates(local.titles.get(normalizeName(t.value.text)));
        if (t.kind === 'custom_id')
            return candidates(local.custom.get(t.value.text));
        if (t.kind === 'local_name')
            return candidates(named(local, t.value.text));
        if (!t.pathValid || t.selector?.kind === 'invalid')
            return state('invalid', 'Invalid file path or selector.');
        if (parsed.source.origin === null && !/^(\/|~\/|[A-Za-z]:[\\/])/.test(t.path.text))
            return state('pending', 'Relative file link has no document origin.');
        const binding = files.get(JSON.stringify([parsed.source.id, t.path.text]));
        if (!binding)
            return state('pending', 'File information has not been supplied.');
        if (binding.result.state === 'missing')
            return state('unresolved', 'Caller confirmed that the file is missing.');
        return t.selector ? search(binding.result.resource, t.selector) : state('resolved', null, [{ kind: 'resource', key: binding.result.resource.key }]);
    };
    for (const node of walk(parsed.document)) {
        if (node.kind !== 'link' && node.kind !== 'footnote_reference')
            continue;
        const resolved = node.kind === 'link' ? resolveLink(node) : candidates(local.notes.get(node.label), false, true);
        references.push({ nodeId: node.id, ...resolved });
        if (resolved.status === 'unresolved' || resolved.status === 'ambiguous' || resolved.status === 'invalid') {
            const code = resolved.status === 'invalid' ? 'invalid-value' : resolved.status;
            const already = diagnostics.some(d => d.code === code && d.location.sourceId === parsed.source.id && node.span.start <= d.location.span.start && d.location.span.end <= node.span.end);
            if (!already)
                diagnostics.push({ code, phase: 'analyze', location: { sourceId: parsed.source.id, span: node.span }, message: resolved.reason ?? code,
                    related: resolved.targets.filter((t) => t.kind === 'node').map(t => ({ location: { sourceId: t.sourceId, span: t.span }, message: 'Matching candidate.' })) });
        }
    }
    const positions = new Map([...walk(parsed.document)].map(n => [n.id, n.span.start]));
    references.sort((a, b) => positions.get(a.nodeId) - positions.get(b.nodeId));
    return { ok: true, value: deepFreeze({ sourceId: parsed.source.id, references, diagnostics: sortDiagnostics(diagnostics) }) };
}
//# sourceMappingURL=analyze.js.map