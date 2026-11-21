// Authorization: what each one can do. Authentication (lessons 1 to 4) says who you are; this says
// what the shop lets you do. It's RBAC (role-based access control): each account and each key has
// a role, and each role, a list of permissions.
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env.ts';
import { notIdentified } from './middleware/session.ts';
import { httpProblem } from './problems.ts';

// #region permissions
// catalogue (Phase 11, lesson 4) is only for API keys: a program that browses the catalogue (a
// price comparison site's agent, for example) and nothing else.
export type Role = 'customer' | 'delivery' | 'admin' | 'catalogue';

export type Permission =
  | 'orders:create'
  | 'orders:view-own'
  | 'orders:view-all'
  | 'orders:change-own' // change the quantity and cancel
  | 'orders:change-all'
  | 'orders:ship' // mark a paid order as shipped
  | 'products:manage' // create and delete products
  | 'notifications:configure' // where to notify of the paid orders (lesson 7)
  | 'assistant:use'; // ask the shop's assistant (Phase 11)

// Each role, with just what its job needs (least privilege): the delivery company sees the orders
// and marks them as shipped, but it doesn't create products or cancel anything. If its key leaks,
// the damage stays at that. The assistant, only for customers: every question costs the shop money.
// catalogue has no permission at all: the catalogue is public, and its key only says who it is and
// lets it in through MCP (src/mcp.ts), where it only sees the catalogue's tools.
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: ['orders:create', 'orders:view-own', 'orders:change-own', 'assistant:use'],
  delivery: ['orders:view-all', 'orders:ship', 'notifications:configure'],
  admin: ['orders:view-all', 'orders:change-all', 'orders:ship', 'products:manage'],
  catalogue: [],
};
// #endregion permissions

// #region can
// The role of whoever makes the request: the session person's or the API key's.
const roleOf = (c: Context<Env>): Role | undefined => (c.var.user ?? c.var.apiKey)?.role;

// The code asks about permissions, never about roles: "can they see all the orders?", and not "are
// they admin?". If tomorrow there's a new role (customer support), giving it its permissions here
// is enough.
export function can(c: Context<Env>, permission: Permission): boolean {
  const role = roleOf(c);
  return role !== undefined && roleCan(role, permission);
}

// The same question, with the role in hand, without a Hono request: the MCP server uses it
// (src/mcp.ts), since it knows the key's role.
export const roleCan = (role: Role, permission: Permission) =>
  PERMISSIONS[role].includes(permission);
// #endregion can

// #region require-permission
// A middleware for each route: it lets through if they have any of those permissions. If it doesn't
// know who you are, 401 ("identify yourself"); if it knows and you can't, 403 ("I know who you
// are, and no").
export const requirePermission =
  (...permissions: Permission[]): MiddlewareHandler<Env> =>
  async (c, next) => {
    if (roleOf(c) === undefined) return notIdentified(c);
    if (!permissions.some((permission) => can(c, permission))) {
      return httpProblem(c, 403, 'Your account does not have permission for this');
    }
    await next();
  };
// #endregion require-permission
