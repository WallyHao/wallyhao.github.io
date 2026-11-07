export function children(node) {
    switch (node.kind) {
        case "document": return [...node.preamble, ...node.headings];
        case "heading": return [...node.title, ...(node.properties ? [node.properties] : []), ...node.body, ...node.headings];
        case "list": return [...node.affiliations, ...node.items];
        case "list_item": return node.body;
        case "paragraph": return [...node.affiliations, ...node.content];
        case "code_block":
        case "example_block":
        case "latex": return node.affiliations;
        case "quote_block": return [...node.affiliations, ...node.body];
        case "table": return [...node.affiliations, ...node.rows];
        case "table_row": return node.cells;
        case "table_cell":
        case "emphasis":
        case "script_part": return node.content;
        case "caption":
        case "document_title": return node.value;
        case "property_drawer": return node.entries;
        case "footnote_definition": return node.body;
        case "scripted": return [node.base, ...node.parts];
        case "link": return node.description ?? [];
        default: return [];
    }
}
export function assignNodeIds(root) {
    const stack = [root];
    let id = 0;
    while (stack.length) {
        const node = stack.pop();
        node.id = id++;
        const descendants = children(node);
        for (let i = descendants.length - 1; i >= 0; i--)
            stack.push(descendants[i]);
    }
}
export function deepFreeze(value) {
    const stack = [];
    if (value !== null && typeof value === "object")
        stack.push(value);
    const seen = new WeakSet();
    while (stack.length) {
        const current = stack.pop();
        if (seen.has(current))
            continue;
        seen.add(current);
        for (const child of Object.values(current)) {
            if (child !== null && typeof child === "object")
                stack.push(child);
        }
        Object.freeze(current);
    }
    return value;
}
//# sourceMappingURL=tree.js.map