export type Role = "owner" | "editor" | "viewer";
export type ShareRole = "viewer" | "editor";

export type ShareRow = { userId: string; name: string; role: ShareRole };

export type DocDto = {
  id: string;
  title: string;
  role: Role;
  owner: { id: string; name: string };
  sharedCount?: number;
  createdAt: string;
  updatedAt: string;
  content: unknown;
  version: number;
  shares?: ShareRow[];
};
