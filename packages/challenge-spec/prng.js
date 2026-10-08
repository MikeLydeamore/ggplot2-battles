export class StableRandom {
  constructor(seed) {
    this.state = Number(seed) >>> 0 || 0x9e3779b9;
    this.spareNormal = null;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next() {
    return this.nextUint32() / 0x100000000;
  }

  integer(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(values) {
    return values[this.integer(0, values.length - 1)];
  }

  normal(mean = 0, standardDeviation = 1) {
    if (this.spareNormal !== null) {
      const spare = this.spareNormal;
      this.spareNormal = null;
      return mean + standardDeviation * spare;
    }
    const first = Math.max(this.next(), Number.EPSILON);
    const second = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(first));
    const primary = magnitude * Math.cos(2 * Math.PI * second);
    this.spareNormal = magnitude * Math.sin(2 * Math.PI * second);
    return mean + standardDeviation * primary;
  }
}
