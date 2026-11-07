import { diagnostic } from '../diagnostics.js';
import { lineValue, MappedTextBuilder } from '../source/mapped-text.js';
import { appendParagraph, bodyState, flush, textNode } from './context.js';
import { finishItem, listMarker, nextItem, startList } from './lists.js';
import { BlockScanner, blockDiagnostics, blockRanges, valueBlock } from './blocks.js';
import { scanLatexBlock } from './latex.js';
import { propertyDrawer } from './metadata.js';
import { table } from './tables.js';
import { footnoteLabel } from './links.js';
import { hydrateInline } from './inline.js';
export function parseStructure(view) {
    const document = { id: -1, kind: 'document', span: { start: 0, end: view.byteLength }, preamble: [], headings: [] };
    const diagnostics = [], scanner = new BlockScanner(view);
    const jobs = [{ start: 0, end: view.lines.length, cut: 0, body: document.preamble, main: true }];
    const lineText = (i) => { const l = view.lines[i]; return view.source.text.slice(l.indentEnd, l.contentEnd); };
    const isHeading = (i) => { const l = view.lines[i]; return /^\*+[ \t]/.test(view.source.text.slice(l.start, l.contentEnd)); };
    const fnHeader = (i) => {
        const l = view.lines[i], m = /^\[fn:([^\]]+)\][ \t]+(.*)$/su.exec(view.source.text.slice(l.start, l.contentEnd));
        return m && footnoteLabel.test(m[1]) ? m : null;
    };
    while (jobs.length) {
        const region = jobs.pop(), headings = [], lists = [];
        let section = bodyState(region.body), blanks = 0;
        const state = () => lists.at(-1)?.state ?? section;
        const dropPending = (s) => {
            for (const node of s.pending) {
                const raw = { id: -1, kind: 'raw_block', form: 'line', span: { ...node.span } };
                if (s.body.at(-1) && s.body.at(-1).span.start > node.span.start)
                    s.body.splice(s.body.length - 1, 0, raw);
                else
                    s.body.push(raw);
                diagnostics.push(diagnostic(view.source, 'orphan', node.span, 'Affiliated keyword has no adjacent eligible content.'));
            }
            s.pending = [];
        };
        const closeList = () => { const f = lists.pop(); dropPending(f.state); finishItem(f); };
        const closeLists = () => { while (lists.length)
            closeList(); };
        const attach = (s, node, column) => {
            if (s.pending.length && 'affiliations' in node && s.pendingColumn === column) {
                node.affiliations = s.pending;
                node.span.start = s.pending[0].span.start;
                s.pending = [];
            }
            else
                dropPending(s);
        };
        const limitFor = (index) => {
            const f = lists.at(-1);
            if (!f)
                return region.end;
            if (f.guardLimit === null) {
                let end = index + 1;
                while (end < region.end) {
                    const l = view.lines[end];
                    if (!l.blank && l.indentColumns < f.contentColumn)
                        break;
                    end++;
                }
                f.guardLimit = end;
            }
            return f.guardLimit;
        };
        for (let i = region.start; i < region.end;) {
            const line = view.lines[i];
            if (i === region.start && region.firstOffset !== undefined) {
                appendParagraph(section, new MappedTextBuilder(view).copy(region.firstOffset, line.contentEnd).finish(), line);
                i++;
                continue;
            }
            if (line.blank) {
                dropPending(state());
                flush(state());
                if (++blanks >= 2)
                    closeLists();
                i++;
                continue;
            }
            blanks = 0;
            const raw = view.source.text.slice(line.start, line.contentEnd), headline = region.main ? /^(\*+)[ \t]+(.*)$/s.exec(raw) : null;
            if (headline) {
                closeLists();
                dropPending(section);
                flush(section);
                const level = headline[1].length;
                while (headings.length && headings.at(-1).level >= level)
                    headings.pop().span.end = line.startByte;
                const title = textNode(new MappedTextBuilder(view).copy(line.contentEnd - headline[2].length, line.contentEnd).finish());
                const node = { id: -1, kind: 'heading', span: { start: line.startByte, end: view.byteLength }, level,
                    headlineSpan: { start: line.startByte, end: line.endByte }, title: title ? [title] : [], properties: null, body: [], headings: [] };
                (headings.at(-1)?.headings ?? document.headings).push(node);
                headings.push(node);
                section = bodyState(node.body);
                i++;
                if (i < region.end) {
                    const drawer = propertyDrawer(view, i, region.end);
                    if (drawer) {
                        diagnostics.push(...drawer.diagnostics);
                        if (drawer.node.kind === 'property_drawer')
                            node.properties = drawer.node;
                        else
                            node.body.push(drawer.node);
                        i = drawer.next;
                    }
                }
                continue;
            }
            const marker = listMarker(view, line);
            let sibling = false;
            while (lists.length && line.indentColumns < lists.at(-1).contentColumn) {
                const f = lists.at(-1);
                if (marker && marker.column === f.column && marker.style === f.list.style) {
                    dropPending(f.state);
                    nextItem(f, view, line, marker);
                    sibling = true;
                    break;
                }
                closeList();
            }
            if (sibling) {
                i++;
                continue;
            }
            const current = state(), cut = lists.at(-1)?.contentColumn ?? region.cut, content = lineText(i), limit = limitFor(i);
            const add = (node, affiliated = true) => { flush(current); if (affiliated)
                attach(current, node, line.indentColumns);
            else
                dropPending(current); current.body.push(node); };
            const rawLine = () => ({ id: -1, kind: 'raw_block', form: 'line', span: { start: view.byteAt(line.indentEnd), end: line.endByte } });
            const h = scanner.header(i);
            if (h) {
                const match = scanner.probe(i, limit, cut);
                diagnostics.push(...blockDiagnostics(view, i, h, !!match));
                if (!match) {
                    add(rawLine(), false);
                    i++;
                    continue;
                }
                if (!match.valid) {
                    add({ id: -1, kind: 'raw_block', form: 'region', span: blockRanges(view, i, match.close).span }, false);
                    i = match.close + 1;
                    continue;
                }
                if (h.kind === 'SRC' || h.kind === 'EXAMPLE')
                    add(valueBlock(view, i, match, cut));
                else if (h.kind === 'COMMENT')
                    add({ id: -1, kind: 'comment', form: 'block', span: blockRanges(view, i, match.close).span, bodySpan: blockRanges(view, i, match.close).bodySpan }, false);
                else {
                    const node = { id: -1, kind: 'quote_block', ...blockRanges(view, i, match.close), affiliations: [], body: [] };
                    add(node);
                    jobs.push({ start: i + 1, end: match.close, cut, body: node.body, main: false });
                }
                i = match.close + 1;
                continue;
            }
            const latex = scanLatexBlock(view, i, limit, cut);
            if (latex) {
                if (latex.node)
                    add(latex.node);
                else {
                    diagnostics.push(diagnostic(view.source, 'unclosed', { start: view.byteAt(line.indentEnd), end: line.contentEndByte }, 'Display formula or environment is not closed.'));
                    add(rawLine(), false);
                }
                i = latex.next;
                continue;
            }
            if (region.main && !lists.length) {
                const footnote = fnHeader(i);
                if (footnote) {
                    let end = i + 1, empty = 0, last = i;
                    for (; end < region.end; end++) {
                        const l = view.lines[end];
                        if (isHeading(end) || fnHeader(end))
                            break;
                        if (l.blank) {
                            if (++empty === 2) {
                                end--;
                                break;
                            }
                            continue;
                        }
                        empty = 0;
                        last = end;
                        const block = scanner.probe(end, region.end, 0);
                        if (block) {
                            last = block.close;
                            end = block.close;
                            continue;
                        }
                        const math = scanLatexBlock(view, end, region.end, 0);
                        if (math?.node) {
                            last = math.next - 1;
                            end = last;
                        }
                    }
                    const node = { id: -1, kind: 'footnote_definition', span: { start: line.startByte, end: view.lines[last].endByte },
                        label: footnote[1], labelSpan: view.range(line.start + 4, line.start + 4 + footnote[1].length), body: [] };
                    add(node, false);
                    jobs.push({ start: i, end, cut: 0, body: node.body, main: false, firstOffset: line.contentEnd - footnote[2].length });
                    i = end;
                    continue;
                }
            }
            const metadata = /^#\+(TITLE|NAME|CAPTION):[ \t]*(.*)$/is.exec(content);
            if (metadata) {
                const key = metadata[1].toUpperCase(), value = new MappedTextBuilder(view).copy(line.contentEnd - metadata[2].length, line.contentEnd).finish(), text = textNode(value), span = { start: view.byteAt(line.indentEnd), end: line.endByte };
                flush(current);
                if (key === 'TITLE' && region.main && !headings.length && !lists.length) {
                    add({ id: -1, kind: 'document_title', span, value: text ? [text] : [] }, false);
                    i++;
                    continue;
                }
                if (key === 'NAME' || key === 'CAPTION') {
                    if (current.pending.length && current.pendingColumn !== line.indentColumns)
                        dropPending(current);
                    const node = key === 'NAME' ? { id: -1, kind: 'name', span, value: value } : { id: -1, kind: 'caption', span, value: text ? [text] : [] };
                    current.pending.push(node);
                    current.pendingColumn = line.indentColumns;
                    i++;
                    continue;
                }
            }
            if (content.startsWith('#+') || /^:END:[ \t]*$/i.test(content) || /^\\end\{[^}]+\}[ \t]*$/.test(content) || /^(\\\]|\$\$)[ \t]*$/.test(content)) {
                if (/^#\+END_(SRC|EXAMPLE|QUOTE|COMMENT)[ \t]*$/i.test(content) || /^:END:[ \t]*$/i.test(content) || /^\\end\{/.test(content) || /^\\\]/.test(content))
                    diagnostics.push(diagnostic(view.source, 'orphan', { start: view.byteAt(line.indentEnd), end: line.contentEndByte }, 'Closing delimiter has no opening construct.'));
                add(rawLine(), false);
                i++;
                continue;
            }
            if (/^#[ \t]+/.test(content)) {
                const prefix = /^#[ \t]+/.exec(content)[0].length;
                add({ id: -1, kind: 'comment', form: 'line', span: { start: view.byteAt(line.indentEnd), end: line.endByte }, bodySpan: view.range(line.indentEnd + prefix, line.contentEnd) }, false);
                i++;
                continue;
            }
            if (content.startsWith('|')) {
                const result = table(view, i, limit, cut);
                add(result.node);
                i = result.next;
                continue;
            }
            if (/^-{5,}[ \t]*$/.test(content)) {
                add({ id: -1, kind: 'horizontal_rule', span: { start: view.byteAt(line.indentEnd), end: line.endByte } }, false);
                i++;
                continue;
            }
            if (marker) {
                const frame = startList(view, line, marker, current);
                attach(current, frame.list, line.indentColumns);
                lists.push(frame);
                i++;
                continue;
            }
            const previous = current.paragraph;
            appendParagraph(current, lineValue(view, line, cut), line);
            if (!previous && current.paragraph)
                attach(current, current.paragraph, line.indentColumns);
            i++;
        }
        closeLists();
        dropPending(section);
        flush(section);
    }
    hydrateInline(document, view, diagnostics);
    return { document, diagnostics };
}
//# sourceMappingURL=structure.js.map