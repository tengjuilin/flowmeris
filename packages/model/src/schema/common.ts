import { z } from 'zod';

/** Building blocks shared by the schema files; not exported from the package. */
export const Num = z.number().finite();
export const Id = z.string().min(1);
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
