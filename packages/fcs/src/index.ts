export * from './types.ts';
export { parseFcs, parseHeader, parseTextSegment, type ParseOptions } from './parse.ts';
export { linearize, isIdentityScaling } from './linearize.ts';
export { writeFcs, type WriteChannel, type WriteOptions } from './write.ts';
