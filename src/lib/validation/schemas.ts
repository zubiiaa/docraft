import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const title = z.string().trim().min(1, "Title cannot be empty").max(200, "Title is too long");

export const loginSchema = z.object({ userId: objectId });

export const createDocSchema = z.object({
  title: title.optional(),
  content: z.unknown().optional(),
});

export const patchDocSchema = z
  .object({
    title: title.optional(),
    content: z.unknown().optional(),
    baseVersion: z.number().int().min(1).optional(),
  })
  .refine((d) => d.title !== undefined || d.content !== undefined, "Nothing to update")
  .refine(
    (d) => d.content === undefined || d.baseVersion !== undefined,
    "baseVersion is required when saving content",
  );

export const shareSchema = z.object({
  userId: objectId,
  role: z.enum(["viewer", "editor"], { message: "Role must be viewer or editor" }),
});

export const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
