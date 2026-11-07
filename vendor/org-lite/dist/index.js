import { deepFreeze } from "./tree.js";
export { analyze } from "./analysis/analyze.js";
export { parse, parseUtf8 } from "./parser/parse.js";
export { slice, positionAt, offsetAt } from "./source/source.js";
/** Version fields describe the data contract, not completion of the syntax specification. */
export const IMPLEMENTATION = deepFreeze({
    stage: "P5",
    complete: true,
    supportedSyntax: ["A1", "A2", "A4", "B1", "B2", "B3", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "D1", "D3", "D4", "D5", "D7", "E4", "E5", "G1", "G2", "H1", "H2", "H6", "I1", "I2", "I4", "J1", "J3", "J4"],
    pending: [],
});
//# sourceMappingURL=index.js.map