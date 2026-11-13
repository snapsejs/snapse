export const logWithHeaders = (values: Record<string, unknown>[]) => {
  const headers = Object.keys(values[0]!)
  console.log(headers.join(' '))
  for (const record of values) {
    console.log(Object.values(record).map((v, i) => String(v).padStart(headers[i]!.length, ' ')).join(' '))
  }
}
