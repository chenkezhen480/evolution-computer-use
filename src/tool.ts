import type { Image } from './shared/image.ts';

/** What a tool hands back: short text, and pictures in the order the agent should see them. */
export interface ToolResult { text: string; images?: Image[] }
export interface ToolContext { signal: AbortSignal }
type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'object';
export interface ParamSpec { type: ParamType; required?: boolean; description?: string }
export interface JsonSchema { type: 'object'; properties: Record<string, { type: ParamType; description?: string; additionalProperties?: boolean }>; required?: string[]; additionalProperties: false }
/** One tool as any host sees it: a name, a description for the model, a JSON Schema for its input, and the work. */
export interface ToolSpec { name: string; description: string; inputSchema: JsonSchema; execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> }

const typeOk: Record<ParamType, (value: unknown) => boolean> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number' && Number.isFinite(value),
  integer: value => Number.isSafeInteger(value),
  boolean: value => typeof value === 'boolean',
  object: value => typeof value === 'object' && value !== null && !Array.isArray(value),
};

/** Checks the arguments against the declared parameters, so a tool's own code only ever sees what it declared. */
export function checkInput(name: string, params: Record<string, ParamSpec>, input: unknown): Record<string, unknown> {
  const args = input === undefined || input === null ? {} : input;
  if (!typeOk.object(args)) throw new Error(`${name} 的参数应该是一个对象`);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    // Hosts send absent optional arguments as null now and then; that is not a value.
    if (value === null || value === undefined) continue;
    const spec = params[key];
    if (!spec) throw new Error(`${name} 不认识参数 ${key}，可用：${Object.keys(params).join('、') || '（没有参数）'}`);
    if (!typeOk[spec.type](value)) throw new Error(`${name} 的参数 ${key} 应该是 ${spec.type}`);
    out[key] = value;
  }
  for (const [key, spec] of Object.entries(params)) if (spec.required && !(key in out)) throw new Error(`${name} 缺少参数 ${key}`);
  return out;
}

type Value<T extends ParamType> = T extends 'string' ? string : T extends 'number' | 'integer' ? number : T extends 'boolean' ? boolean : Record<string, unknown>;
type Required<P extends Record<string, ParamSpec>> = { [K in keyof P]: P[K]['required'] extends true ? K : never }[keyof P];
/** The checked arguments, typed by the parameter list: required ones present, optional ones possibly absent. */
export type Input<P extends Record<string, ParamSpec>> =
  { [K in Required<P>]: Value<P[K]['type']> } & { [K in Exclude<keyof P, Required<P>>]?: Value<P[K]['type']> };

/** A tool from a short parameter list; its input is checked before `execute` runs. */
export function defineTool<const P extends Record<string, ParamSpec>>(spec: {
  name: string; description: string; parameters: P;
  execute(args: Input<P>, context: ToolContext): Promise<ToolResult | string>;
}): ToolSpec {
  const required = Object.entries(spec.parameters).filter(([, param]) => param.required).map(([key]) => key);
  const properties = Object.fromEntries(Object.entries(spec.parameters).map(([key, param]) => [key, {
    type: param.type, ...(param.description ? { description: param.description } : {}), ...(param.type === 'object' ? { additionalProperties: true } : {}),
  }]));
  return {
    name: spec.name, description: spec.description,
    inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
    async execute(input, context) {
      const result = await spec.execute(checkInput(spec.name, spec.parameters, input) as Input<P>, context);
      return typeof result === 'string' ? { text: result } : result;
    },
  };
}
