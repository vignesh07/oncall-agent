import { describe, it, expect } from 'vitest'
import { add, subtract, multiply, divide, percentage } from '../src/utils/calculator'

describe('Calculator utilities', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5)
    })

    it('should add negative numbers', () => {
      expect(add(-2, -3)).toBe(-5)
    })

    it('should add mixed positive and negative numbers', () => {
      expect(add(5, -3)).toBe(2)
    })
  })

  describe('subtract', () => {
    it('should subtract two positive numbers', () => {
      expect(subtract(5, 3)).toBe(2)
    })

    it('should subtract negative numbers', () => {
      expect(subtract(-5, -3)).toBe(-2)
    })

    it('should subtract mixed positive and negative numbers', () => {
      expect(subtract(5, -3)).toBe(8)
    })
  })

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(multiply(3, 4)).toBe(12)
    })

    it('should multiply negative numbers', () => {
      expect(multiply(-3, -4)).toBe(12)
    })

    it('should multiply mixed positive and negative numbers', () => {
      expect(multiply(3, -4)).toBe(-12)
    })
  })

  describe('divide', () => {
    it('should divide two positive numbers', () => {
      expect(divide(10, 2)).toBe(5)
    })

    it('should divide with decimal results', () => {
      expect(divide(10, 4)).toBe(2.5)
    })

    it('should throw error when dividing by zero', () => {
      expect(() => divide(10, 0)).toThrow('Division by zero is not allowed')
    })

    it('should throw error when dividing by negative numbers', () => {
      expect(() => divide(10, -2)).toThrow('Division by negative numbers is not allowed')
    })

    it('should allow negative dividend', () => {
      expect(divide(-10, 2)).toBe(-5)
    })
  })

  describe('percentage', () => {
    it('should calculate percentage correctly', () => {
      expect(percentage(25, 100)).toBe(25)
    })

    it('should calculate percentage with decimals', () => {
      expect(percentage(33, 100)).toBe(33)
    })

    it('should calculate percentage greater than 100', () => {
      expect(percentage(150, 100)).toBe(150)
    })

    it('should throw error when total is zero', () => {
      expect(() => percentage(10, 0)).toThrow('Cannot calculate percentage with total of zero')
    })

    it('should handle negative values', () => {
      expect(percentage(-25, 100)).toBe(-25)
    })

    it('should handle negative total', () => {
      expect(percentage(25, -100)).toBe(-25)
    })
  })
})
