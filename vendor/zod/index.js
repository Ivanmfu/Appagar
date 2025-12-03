class Schema {
  constructor() {
    this._default = undefined;
    this._optional = false;
    this.transforms = [];
    this.validators = [];
  }

  optional() {
    const clone = this._clone();
    clone._optional = true;
    return clone;
  }

  default(value) {
    const clone = this._clone();
    clone._default = value;
    return clone;
  }

  _clone() {
    const clone = Object.create(this.constructor.prototype);
    Object.assign(clone, this);
    clone.transforms = [...(this.transforms ?? [])];
    clone.validators = [...(this.validators ?? [])];
    return clone;
  }

  _applyTransforms(value) {
    return this.transforms.reduce((current, transform) => transform(current), value);
  }

  _parseInput(value) {
    const val = value === undefined ? this._default : value;
    if (val === undefined) {
      if (this._optional) return { success: true, data: undefined };
      return { success: false, error: { issues: [{ message: 'Valor requerido' }] } };
    }
    const typeCheck = this._typeCheck(val);
    if (!typeCheck.success) return typeCheck;
    const transformed = this._applyTransforms(typeCheck.data);
    for (const validator of this.validators) {
      const result = validator(transformed);
      if (!result.success) return result;
    }
    return { success: true, data: transformed };
  }

  safeParse(value) {
    return this._parseInput(value);
  }

  parse(value) {
    const result = this._parseInput(value);
    if (!result.success) {
      const message = result.error?.issues?.[0]?.message || 'Entrada inválida';
      throw new Error(message);
    }
    return result.data;
  }
}

class ZodString extends Schema {
  _typeCheck(value) {
    if (typeof value !== 'string') {
      return { success: false, error: { issues: [{ message: 'Debe ser un texto' }] } };
    }
    return { success: true, data: value };
  }

  min(length, message = `Debe tener al menos ${length} caracteres`) {
    const clone = this._clone();
    clone.validators.push((value) =>
      value.length >= length ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  length(length, message = `Debe tener ${length} caracteres`) {
    const clone = this._clone();
    clone.validators.push((value) =>
      value.length === length ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  max(length, message = `No puede superar ${length} caracteres`) {
    const clone = this._clone();
    clone.validators.push((value) =>
      value.length <= length ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  trim() {
    const clone = this._clone();
    clone.transforms.push((value) => value.trim());
    return clone;
  }

  toUpperCase() {
    const clone = this._clone();
    clone.transforms.push((value) => value.toUpperCase());
    return clone;
  }

  regex(pattern, message = 'Formato inválido') {
    const clone = this._clone();
    clone.validators.push((value) =>
      pattern.test(value) ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  email(message = 'Correo inválido') {
    const emailPattern = /.+@.+\..+/u;
    return this.regex(emailPattern, message);
  }
}

class ZodNumber extends Schema {
  _typeCheck(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { success: false, error: { issues: [{ message: 'Debe ser un número' }] } };
    }
    return { success: true, data: value };
  }

  int(message = 'Debe ser un entero') {
    const clone = this._clone();
    clone.validators.push((value) =>
      Number.isInteger(value) ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  nonnegative(message = 'Debe ser un número no negativo') {
    const clone = this._clone();
    clone.validators.push((value) =>
      value >= 0 ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  positive(message = 'Debe ser mayor que cero') {
    const clone = this._clone();
    clone.validators.push((value) =>
      value > 0 ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }
}

class ZodArray extends Schema {
  constructor(schema) {
    super();
    this.schema = schema;
  }

  _typeCheck(value) {
    if (!Array.isArray(value)) {
      return { success: false, error: { issues: [{ message: 'Debe ser una lista' }] } };
    }
    const results = [];
    for (const item of value) {
      const parsed = this.schema.safeParse(item);
      if (!parsed.success) return parsed;
      results.push(parsed.data);
    }
    return { success: true, data: results };
  }

  nonempty(message = 'La lista no puede estar vacía') {
    const clone = this._clone();
    clone.validators.push((value) =>
      value.length > 0 ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }

  max(length, message = 'La lista es demasiado grande') {
    const clone = this._clone();
    clone.validators.push((value) =>
      value.length <= length ? { success: true, data: value } : { success: false, error: { issues: [{ message }] } },
    );
    return clone;
  }
}

class ZodObject extends Schema {
  constructor(shape) {
    super();
    this.shape = shape;
  }

  _typeCheck(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { success: false, error: { issues: [{ message: 'Debe ser un objeto' }] } };
    }
    const parsed = {};
    for (const key of Object.keys(this.shape)) {
      const schema = this.shape[key];
      const result = schema.safeParse(value[key]);
      if (!result.success) return result;
      if (result.data !== undefined) {
        parsed[key] = result.data;
      }
    }
    return { success: true, data: parsed };
  }

  extend(extension) {
    return new ZodObject({ ...this.shape, ...extension });
  }
}

function string(options = {}) {
  const schema = new ZodString();
  if (options.required_error) {
    schema.validators.push((value) =>
      value === undefined || value === null || value === ''
        ? { success: false, error: { issues: [{ message: options.required_error }] } }
        : { success: true, data: value },
    );
  }
  return schema;
}

function number(options = {}) {
  const schema = new ZodNumber();
  if (options.required_error) {
    schema.validators.push((value) =>
      value === undefined || value === null
        ? { success: false, error: { issues: [{ message: options.required_error }] } }
        : { success: true, data: value },
    );
  }
  return schema;
}

function array(schema) {
  return new ZodArray(schema);
}

function object(shape) {
  return new ZodObject(shape);
}

export const z = { string, number, array, object };
export default z;
