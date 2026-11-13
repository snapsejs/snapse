// Shared RLE decoders for computeMutation's run-length encoding
// Negative values signify a run from the preceding value:
//   [1, 3, -6, 9] becomes 1, 3, 4, 5, 9

export const decodeAscendingRLE = function* (range: number[] | undefined): Generator<number> {
  if (!range) return
  let runStart
  for (let k = 0; k < range.length; k++) {
    const v = range[k]!
    if (v < 0) {
      for (let j = runStart! + 1; j < -v; j++) yield j
    } else {
      runStart = v
      yield v
    }
  }
}
