import { useState, useEffect, useCallback, useRef } from 'react';
import { Order, Expense, MenuItem } from './types';
import { supabase } from './lib/supabase';

// Helper: today's start/end as unix ms
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

function isTodayTimestamp(timestamp: number) {
  const { start, end } = todayRange();
  return timestamp >= start && timestamp <= end;
}

// Map DB row → MenuItem
function toMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: row.id as string,
    name: row.name as string,
    price: Number(row.price),
    dishPrice: row.dish_price != null ? Number(row.dish_price) : undefined,
    category: row.category as string,
    hasVariants: (row.has_variants as boolean) || false,
    hasGolaVariants: (row.has_gola_variants as boolean) || false,
    golaVariantPrices: row.gola_variant_prices ? (row.gola_variant_prices as any) : undefined,
  };
}

// Map DB row → Order
function toOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    orderNumber: row.order_number as number,
    customerName: row.customer_name as string,
    items: row.items as Order['items'],
    total: Number(row.total),
    status: row.status as Order['status'],
    paymentMethod: row.payment_method as Order['paymentMethod'],
    paymentStatus: row.payment_status as Order['paymentStatus'],
    timestamp: row.timestamp as number,
  };
}

// Map DB row → Expense
function toExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    description: row.description as string,
    amount: Number(row.amount),
    timestamp: row.timestamp as number,
  };
}

function upsertOrder(list: Order[], order: Order) {
  return [order, ...list.filter((item) => item.id !== order.id)].sort((a, b) => b.timestamp - a.timestamp);
}

function upsertMenuItem(list: MenuItem[], menuItem: MenuItem) {
  const index = list.findIndex((item) => item.id === menuItem.id);
  if (index === -1) return [...list, menuItem];

  const next = [...list];
  next[index] = menuItem;
  return next;
}

function buildOrderFingerprint(order: {
  timestamp: number;
  customerName: string;
  total: number;
  itemCount: number;
}) {
  return `${order.timestamp}|${order.customerName}|${order.total}|${order.itemCount}`;
}

export function useStore() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomingOrderNotification, setIncomingOrderNotification] = useState<Order | null>(null);
  const localInsertFingerprintsRef = useRef<Map<string, number>>(new Map());

  // Initial data fetch
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { start, end } = todayRange();

    const [menuRes, ordersRes, expensesRes] = await Promise.all([
      supabase.from('menu_items').select('*').order('created_at'),
      supabase.from('orders').select('*').gte('timestamp', start).lte('timestamp', end).order('timestamp', { ascending: false }),
      supabase.from('expenses').select('*').order('timestamp', { ascending: false }),
    ]);

    if (menuRes.data) setMenuItems(menuRes.data.map(toMenuItem));
    if (ordersRes.data) setOrders(ordersRes.data.map(toOrder));
    if (expensesRes.data) setExpenses(expensesRes.data.map(toExpense));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime sync: keep menu and orders consistent across POS + customer devices.
  useEffect(() => {
    const ordersChannel = supabase
      .channel('pos-live-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id as string | undefined;
            if (!deletedId) return;
            setOrders((prev) => prev.filter((order) => order.id !== deletedId));
            return;
          }

          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;

          const parsed = toOrder(row);
          if (!isTodayTimestamp(parsed.timestamp)) return;

          if (payload.eventType === 'INSERT') {
            const fingerprint = buildOrderFingerprint({
              timestamp: parsed.timestamp,
              customerName: parsed.customerName,
              total: parsed.total,
              itemCount: parsed.items.length,
            });
            const expiresAt = localInsertFingerprintsRef.current.get(fingerprint);
            const isLocalInsert = typeof expiresAt === 'number' && expiresAt > Date.now();
            localInsertFingerprintsRef.current.delete(fingerprint);

            setOrders((prev) => upsertOrder(prev, parsed));
            if (!isLocalInsert) {
              setIncomingOrderNotification(parsed);
            }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((prev) => upsertOrder(prev, parsed));
          }
        }
      )
      .subscribe();

    const menuChannel = supabase
      .channel('pos-live-menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id as string | undefined;
            if (!deletedId) return;
            setMenuItems((prev) => prev.filter((item) => item.id !== deletedId));
            return;
          }

          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;

          const parsed = toMenuItem(row);
          setMenuItems((prev) => upsertMenuItem(prev, parsed));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(menuChannel);
    };
  }, []);

  // Derive today's order counter
  const getNextOrderNumber = useCallback(async (): Promise<number> => {
    const { start, end } = todayRange();
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', start)
      .lte('timestamp', end);
    return (count ?? 0) + 1;
  }, []);

  const addOrder = useCallback(async (orderData: Omit<Order, 'id' | 'orderNumber' | 'timestamp'>) => {
    const orderNumber = await getNextOrderNumber();
    const timestamp = Date.now();
    const fingerprint = buildOrderFingerprint({
      timestamp,
      customerName: orderData.customerName,
      total: orderData.total,
      itemCount: orderData.items.length,
    });
    localInsertFingerprintsRef.current.set(fingerprint, Date.now() + 15000);

    const newOrder = {
      order_number: orderNumber,
      customer_name: orderData.customerName,
      items: orderData.items,
      total: orderData.total,
      status: orderData.status,
      payment_method: orderData.paymentMethod,
      payment_status: orderData.paymentStatus,
      timestamp,
    };

    const { data, error } = await supabase.from('orders').insert(newOrder).select().single();
    if (!error && data) {
      setOrders((prev) => upsertOrder(prev, toOrder(data)));
      return;
    }
    localInsertFingerprintsRef.current.delete(fingerprint);
  }, [getNextOrderNumber]);

  const updateOrderStatus = useCallback(async (id: string, status: 'pending' | 'completed') => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (!error) {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    }
  }, []);

  const updatePayment = useCallback(async (id: string, method: 'cash' | 'upi') => {
    const { error } = await supabase
      .from('orders')
      .update({ payment_method: method, payment_status: 'paid' })
      .eq('id', id);
    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, paymentMethod: method, paymentStatus: 'paid' } : o))
      );
    }
  }, []);

  const addExpense = useCallback(async (description: string, amount: number) => {
    const newExpense = { description, amount, timestamp: Date.now() };
    const { data, error } = await supabase.from('expenses').insert(newExpense).select().single();
    if (!error && data) {
      setExpenses((prev) => [toExpense(data), ...prev]);
    }
  }, []);

  const addMenuItem = useCallback(async (item: Omit<MenuItem, 'id'>) => {
    const row = {
      name: item.name,
      price: item.hasGolaVariants ? (item.golaVariantPrices?.['Plain'] ?? item.price) : item.price,
      dish_price: item.dishPrice ?? null,
      category: item.category,
      has_variants: item.hasVariants ?? false,
      has_gola_variants: item.hasGolaVariants ?? false,
      gola_variant_prices: item.hasGolaVariants ? item.golaVariantPrices ?? null : null,
    };
    const { data, error } = await supabase.from('menu_items').insert(row).select().single();
    if (!error && data) {
      setMenuItems((prev) => [...prev, toMenuItem(data)]);
    }
  }, []);

  const updateMenuItem = useCallback(async (id: string, updatedItem: Omit<MenuItem, 'id'>) => {
    const row = {
      name: updatedItem.name,
      price: updatedItem.hasGolaVariants ? (updatedItem.golaVariantPrices?.['Plain'] ?? updatedItem.price) : updatedItem.price,
      dish_price: updatedItem.dishPrice ?? null,
      category: updatedItem.category,
      has_variants: updatedItem.hasVariants ?? false,
      has_gola_variants: updatedItem.hasGolaVariants ?? false,
      gola_variant_prices: updatedItem.hasGolaVariants ? updatedItem.golaVariantPrices ?? null : null,
    };
    const { error } = await supabase.from('menu_items').update(row).eq('id', id);
    if (!error) {
      setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...updatedItem, id } : m)));
    }
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (!error) {
      setMenuItems((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  const clearData = useCallback(async () => {
    if (!window.confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    const { start, end } = todayRange();
    await Promise.all([
      supabase.from('orders').delete().gte('timestamp', start).lte('timestamp', end),
      supabase.from('expenses').delete().gte('timestamp', 0),
    ]);
    setOrders([]);
    setExpenses([]);
  }, []);

  const clearIncomingOrderNotification = useCallback(() => {
    setIncomingOrderNotification(null);
  }, []);

  return {
    menuItems,
    orders,
    expenses,
    loading,
    incomingOrderNotification,
    addOrder,
    updateOrderStatus,
    updatePayment,
    addExpense,
    clearData,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    clearIncomingOrderNotification,
  };
}
