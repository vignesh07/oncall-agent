/**
 * Simple calculator utilities
 * Used for demonstrating oncall-agent fixes
 */

export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}

export function multiply(a: number, b: number): number {
  return a * b
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero is not allowed')
  }
  return a / b
}

export function percentage(value: number, total: number): number {
  if (total === 0) {
    throw new Error('Cannot calculate percentage with total of zero')
  }
  return (value / total) * 100
}
