// JSON doesn't support BigInt — convert all BigInt fields to string recursively
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    )
  )
}
