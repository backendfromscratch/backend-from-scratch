// Authorization: what each one can do. Authentication (lessons 1 to 4) says who you are; this says
// what the shop lets you do. It's RBAC (role-based access control): each account and each key has
// a role, and each role, a list of permissions.
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env.ts';
import { notIdentified } from './middleware/session.ts';
import { httpProblem } from './problems.ts';

// #region permissions
export type Role = 'customer' | 'delivery' | 'admin';

export type Permission =
  | 'orders:create'
  | 'orders:view-own'
  | 'orders:view-all'
  | 'orders:change-own' // change the quantity and cancel
  | 'orders:change-all'
  | 'orders:ship' // mark a paid order as shipped
  | 'products:manage'; // create and delete products

// Each role, with just what its job needs (least privilege): the delivery company sees the orders
// and marks them as shipped, but it doesn't create products or cancel anything. If its key leaks,
// the damage stays at that.
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: ['orders:create', 'orders:view-own', 'orders:change-own'],
  delivery: ['orders:view-all', 'orders:ship'],
  admin: ['orders:view-all', 'orders:change-all', 'orders:ship', 'products:manage'],
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
  return role !== undefined && PERMISSIONS[role].includes(permission);
}
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
