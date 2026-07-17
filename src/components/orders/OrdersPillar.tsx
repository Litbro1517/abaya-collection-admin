'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Archive } from 'lucide-react';
import OrdersTable from './OrdersTable';
import { toast } from 'sonner';
import frDict from '@/lib/i18n/dictionaries';

const t = frDict.adminOrder;

type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  productName: string;
  productColor: string;
  productSize: string;
  productImage: string;
  productPrice: string;
  productQuantity: number;
  status: string;
  isDeleted: boolean;
  createdAt: string;
};

export default function OrdersPillar() {
  const [view, setView] = useState<'active' | 'archived' | 'all'>('active');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [ca, setCa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch orders — dependency array includes page, statusFilter, search, view
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        view,
        status: statusFilter,
        search,
      });
      const res = await fetch(`/api/orders?${params}`);
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCa(data.ca);
    } catch (err) {
      console.error('Fetch orders error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, view]);

  // Re-fetch on any dependency change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Clear selection and reset page when search changes
  useEffect(() => {
    setSelectedIds(new Set());
    setPage(0);
  }, [search]);

  // Reset page when view/statusFilter changes
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [view, statusFilter]);

  const handleViewChange = useCallback((v: string) => {
    setView(v as typeof view);
    setSearch(''); // Reset search so child input syncs via useEffect
  }, []);

  const handleStatusFilterChange = useCallback((v: string) => {
    setStatusFilter(v);
    setSearch(''); // Reset search
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleCellUpdated = useCallback(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (orders.every(o => selectedIds.has(o.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)));
    }
  }, [orders, selectedIds]);

  const handleArchive = async (ids: string[]) => {
    try {
      const res = await fetch('/api/orders/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids, archive: view !== 'archived' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t.archiveError);
        return;
      }
      toast.success(view === 'archived' ? t.unarchiveSuccess : t.archiveSuccess);
      setSelectedIds(new Set());
      fetchOrders();
    } catch {
      toast.error(t.archiveError);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.all}</SelectItem>
              <SelectItem value="pending">{t.pending}</SelectItem>
              <SelectItem value="confirmed">{t.confirm}</SelectItem>
              <SelectItem value="shipped">{t.shipped}</SelectItem>
              <SelectItem value="delivered">{t.delivered}</SelectItem>
              <SelectItem value="cancelled">{t.cancelled}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View tabs */}
      <Tabs value={view} onValueChange={handleViewChange}>
        <TabsList className="h-8">
          <TabsTrigger value="active" className="text-xs px-3 h-7 gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />
            {t.active}
          </TabsTrigger>
          <TabsTrigger value="archived" className="text-xs px-3 h-7 gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            {t.archived}
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs px-3 h-7">
            {t.all}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Orders table */}
      <OrdersTable
        orders={orders}
        total={total}
        page={page}
        totalPages={totalPages}
        ca={ca}
        search={search}
        onPageChange={handlePageChange}
        onSearchChange={setSearch}
        onCellUpdated={handleCellUpdated}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onArchive={handleArchive}
        statusFilter={statusFilter}
      />
    </div>
  );
}