import '@testing-library/jest-dom/vitest'

if (!globalThis.CSS) {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {},
  })
}

if (!globalThis.CSS.supports) {
  Object.defineProperty(globalThis.CSS, 'supports', {
    configurable: true,
    value: () => false,
  })
}

if (!HTMLImageElement.prototype.decode) {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  })
}
