// The cart page's order (server only; registered with the page renderer's hooks when the middleware loads
// this module): the order a Cart block shows for the page's ?order=<token> (src/render/c/shop.ts).
import { renderHooks } from '../../render/hooks';
import { ORDER_KEY } from '../../render/c/shop';
import { serviceClient } from '../db/site';
import { orderByToken } from './orders';

renderHooks.shopOrder = async (ctx) => {
  if (ctx.data.has(ORDER_KEY)) return;
  const order = await orderByToken(serviceClient(), ctx.queried.url.searchParams.get('order') ?? '');
  if (order) ctx.data.set(ORDER_KEY, order);
  ctx.personal = true;
};
