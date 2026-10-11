import { resolveAccess, type Access, type Role } from "@/lib/authz/access";
import { UserModel } from "@/lib/models/User";

type LeanDoc = {
  _id: unknown;
  title: string;
  ownerId: unknown;
  shares: { userId: unknown; role: Role }[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  content?: unknown;
};

export async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await UserModel.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

function base(d: LeanDoc, access: Access | null, names: Map<string, string>) {
  const ownerId = String(d.ownerId);
  return {
    id: String(d._id),
    title: d.title,
    role: access,
    owner: { id: ownerId, name: names.get(ownerId) ?? "Unknown" },
    // Only the owner needs to know how many people the doc is shared with.
    sharedCount: access === "owner" ? d.shares.length : undefined,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toListItem(d: LeanDoc, viewerId: string, names: Map<string, string>) {
  const access = resolveAccess(
    {
      ownerId: String(d.ownerId),
      shares: d.shares.map((s) => ({ userId: String(s.userId), role: s.role })),
    },
    viewerId,
  );
  return base(d, access, names);
}

export function toFullDto(d: LeanDoc, access: Access, names: Map<string, string>) {
  return {
    ...base(d, access, names),
    content: d.content,
    version: d.version,
    // Sharing details are visible to the owner only.
    shares:
      access === "owner"
        ? d.shares.map((s) => ({
            userId: String(s.userId),
            name: names.get(String(s.userId)) ?? "Unknown",
            role: s.role,
          }))
        : undefined,
  };
}
