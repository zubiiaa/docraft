import mongoose, { Schema, type Model, type Types } from "mongoose";
import { EMPTY_DOC } from "../validation/content";

export interface ShareEntry {
  userId: Types.ObjectId;
  role: "viewer" | "editor";
}

export interface DocumentDoc {
  title: string;
  content: Record<string, unknown>;
  ownerId: Types.ObjectId;
  shares: ShareEntry[];
  /** Incremented on every content save; used to reject stale autosaves. */
  version: number;
  /** Timestamp gate for server-enforced automatic snapshot spacing. */
  lastAutomaticSnapshotAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ShareSchema = new Schema<ShareEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["viewer", "editor"], required: true },
  },
  { _id: false },
);

const DocumentSchema = new Schema<DocumentDoc>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, default: "Untitled document" },
    content: { type: Schema.Types.Mixed, required: true, default: () => ({ ...EMPTY_DOC }) },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shares: { type: [ShareSchema], default: [] },
    version: { type: Number, default: 1 },
    lastAutomaticSnapshotAt: { type: Date },
  },
  { timestamps: true, minimize: false },
);

// "Shared with me" lookups.
DocumentSchema.index({ "shares.userId": 1 });

export const DocumentModel: Model<DocumentDoc> =
  (mongoose.models.Document as Model<DocumentDoc>) ||
  mongoose.model<DocumentDoc>("Document", DocumentSchema);

export interface CommentDoc {
  documentId: Types.ObjectId;
  authorId: Types.ObjectId;
  text: string;
  createdAt: Date;
}

const CommentSchema = new Schema<CommentDoc>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const CommentModel: Model<CommentDoc> =
  (mongoose.models.Comment as Model<CommentDoc>) || mongoose.model<CommentDoc>("Comment", CommentSchema);

export interface DocumentVersionDoc {
  documentId: Types.ObjectId;
  title: string;
  content: unknown;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const DocumentVersionSchema = new Schema<DocumentVersionDoc>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const DocumentVersionModel: Model<DocumentVersionDoc> =
  (mongoose.models.DocumentVersion as Model<DocumentVersionDoc>) ||
  mongoose.model<DocumentVersionDoc>("DocumentVersion", DocumentVersionSchema);
