export interface SchemaResource {
  absolutePath: string;
  relativePath: string;
  schema: Record<string, unknown> & {
    $id: string;
    title?: string;
  };
}

export const packageRoot: string;
export const schemasRoot: string;
export function loadSchemas(): SchemaResource[];
