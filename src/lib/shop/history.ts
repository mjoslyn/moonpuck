// An order's history (table shop_order_events): what happened to it, when and by whom (empty: the site
// itself), shown on its page with the shop's notes. Written by the server; a failed write is logged and
// never stops what it records. Server only.
import type { Db } from '../db/query';

export type OrderEventKind = 'placed' | 'paid' | 'email' | 'fulfilled' | 'refund' | 'restock' | 'cancelled' | 'expired' | 'delivered' | 'label' | 'status' | 'note';

export interface OrderEvent {
  id: number;
  order_id: number;
  at: string;
  kind: OrderEventKind;
  by: string;
  text: string;
  data: Record<string, unknown> | null;
}

export const MAX_NOTE = 5000;

/** Record something that happened to an order. */
export async function logOrder(db: Db, orderId: number, kind: OrderEventKind, text: string, by = '', data?: Record<string, unknown>) {
  try {
    const { error } = await db.from('shop_order_events').insert({ order_id: orderId, kind, text: text.slice(0, MAX_NOTE), by: by.slice(0, 200), data: data ?? null });
    if (error) throw error;
  } catch (e) {
    console.error(`shop: recording ${kind} for order ${orderId}: ${(e as Error).message}`);
  }
}

/** An order's history, newest first. */
export async function orderHistory(db: Db, orderId: number): Promise<OrderEvent[]> {
  const { data } = await db.from('shop_order_events').select('*').eq('order_id', orderId).order('at', { ascending: false }).order('id', { ascending: false }).limit(500);
  return (data ?? []) as OrderEvent[];
}
