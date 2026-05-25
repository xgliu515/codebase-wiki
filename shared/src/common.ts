import { z } from 'zod';

// slug: 全小写 ASCII,字母数字开头,允许 hyphen,长度 1-64
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'slug must be kebab-case ASCII (1-64 chars)');

// version_label: 非空,无 / \ 空格,无 .. 序列
// 接受: semver (v0.22.0 / 1.0.0), pre-release (v1.0.0-rc.1), branch+hash (main-a1b2c3d)
export const VersionLabelSchema = z
  .string()
  .min(1)
  .regex(/^[^\s/\\]+$/, 'version_label must not contain spaces or slashes')
  .refine((s) => !s.includes('..'), 'version_label must not contain ..');

// 相对路径:无 ..,无前导 /,无 \\,非空
export const RelativePathSchema = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith('/'), 'must be relative')
  .refine((s) => !s.includes('\\'), 'no backslashes')
  .refine((s) => !s.split('/').includes('..'), 'no parent traversal');

// BCP-47-ish: 2-3 字母,可选 -2-3字母/数字 后缀
export const LanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'language must be BCP-47-like (e.g. zh-CN, en)');

// 内容类型 v1 仅 codebase,留扩展位
export const ContentTypeSchema = z.enum(['codebase']);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// schema_version: "MAJOR.MINOR"(无 PATCH)
export const SchemaVersionSchema = z
  .string()
  .regex(/^\d+\.\d+$/, 'schema_version must be MAJOR.MINOR');

export function parseSchemaMajor(version: string): number {
  const m = version.match(/^(\d+)\.\d+$/);
  if (!m || m[1] === undefined) {
    throw new Error(`invalid schema_version: ${version}`);
  }
  return Number(m[1]);
}
