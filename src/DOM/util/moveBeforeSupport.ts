type EElement = typeof Element & { prototype: typeof Element.prototype & { moveBefore?: unknown } }
export const supportsMoveBefore = typeof Element !== 'undefined'
  && typeof (Element as EElement).prototype.moveBefore === 'function'
