// Duck-typed on `nodeType` rather than `instanceof Node`/`Element`: the controllers run against
// both real DOM nodes and the server stand-ins (DOM/server/serverNodes.ts), and a server has no
// Node or Element global to test against in the first place.
export const isDOMNode = (v: unknown): v is Node => typeof (v as Node | null)?.nodeType === 'number'

export const isElementNode = (v: unknown) => (v as Node | null)?.nodeType === 1
