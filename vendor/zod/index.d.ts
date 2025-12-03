export type SafeParseSuccess<T> = { success: true; data: T };
export type SafeParseError = { success: false; error: { issues: { message: string }[] } };
export type SafeParseReturnType<T> = SafeParseSuccess<T> | SafeParseError;

declare class Schema<T> {
  optional(): this;
  default(value: T): this;
  safeParse(value: unknown): SafeParseReturnType<T | undefined>;
  parse(value: unknown): T;
}

declare class ZodString extends Schema<string> {
  min(length: number, message?: string): this;
  length(length: number, message?: string): this;
  max(length: number, message?: string): this;
  trim(): this;
  toUpperCase(): this;
  regex(pattern: RegExp, message?: string): this;
  email(message?: string): this;
}

declare class ZodNumber extends Schema<number> {
  int(message?: string): this;
  nonnegative(message?: string): this;
  positive(message?: string): this;
}

declare class ZodArray<T> extends Schema<T[]> {
  nonempty(message?: string): this;
  max(length: number, message?: string): this;
}

declare class ZodObject<T extends Record<string, any>> extends Schema<T> {
  extend<U extends Record<string, any>>(extension: U): ZodObject<T & U>;
}

declare function string(options?: { required_error?: string }): ZodString;
declare function number(options?: { required_error?: string }): ZodNumber;
declare function array<T>(schema: Schema<T>): ZodArray<T>;
declare function object<T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }): ZodObject<T>;

export const z: {
  string: typeof string;
  number: typeof number;
  array: typeof array;
  object: typeof object;
};

export default z;
