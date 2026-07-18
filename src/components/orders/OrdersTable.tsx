'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, AlertCircle, AlertTriangle, RotateCcw, Check, X, Archive } from 'lucide-react';
import { toast } from 'sonner';
import frDict from '@/lib/i18n/dictionaries';

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

type OrdersTableProps = {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
  ca: number;
  search: string;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  onCellUpdated: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onArchive: (ids: string[]) => void;
  statusFilter: string;
};

const t = frDict.adminOrder;

// ── Sliding window pagination (FX31) ──
function generatePageButtons(current: number, total: number, delta = 2): (number | '...')[] {
  if (total <= 1) return [1];
  const pages: (number | '...')[] = [];
  const range: number[] = [];

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  let prev: number | null = null;
  for (const p of range) {
    if (prev !== null && p - prev > 1) {
      pages.push('...');
    }
    pages.push(p);
    prev = p;
  }
  return pages;
}

// ── DataQualityIcon — extended to all relevant fields (Point 3c) ──
function DataQualityIcon({ value, field }: { value: string; field: string }) {
  // Empty check
  if (!value || value.trim() === '') {
    return (
      <span className="inline-flex ml-1" title={t.emptyWarning}>
        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
      </span>
    );
  }

  // Numeric zero check (for price fields)
  if (field === 'productPrice' && parseFloat(value) === 0) {
    return (
      <span className="inline-flex ml-1" title={t.zeroWarning}>
        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
      </span>
    );
  }

  // Low value check (for price)
  if (field === 'productPrice' && parseFloat(value) < 10) {
    return (
      <span className="inline-flex ml-1" title={t.lowWarning}>
        <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
      </span>
    );
  }

  // Missing image
  if (field === 'productImage' && (!value || value.trim() === '')) {
    return (
      <span className="inline-flex ml-1" title={t.noImage}>
        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
      </span>
    );
  }

  return null;
}

// ── Status badge colors ──
function statusVariant(status: string) {
  switch (status) {
    case 'pending': return 'secondary' as const;
    case 'confirmed': return 'default' as const;
    case 'shipped': return 'outline' as const;
    case 'delivered': return 'default' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'secondary' as const;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending': return t.pending;
    case 'confirmed': return t.confirm;
    case 'shipped': return t.shipped;
    case 'delivered': return t.delivered;
    case 'cancelled': return t.cancelled;
    default: return status;
  }
}

// ── Editable fields definition ──
const EDITABLE_FIELDS = [
  'customerName', 'customerPhone', 'customerCity', 'customerAddress',
  'productName', 'productColor', 'productSize', 'productPrice', 'productQuantity',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export default function OrdersTable({
  orders, total, page, totalPages, ca, search,
  onPageChange, onSearchChange, onCellUpdated,
  selectedIds, onToggleSelect, onToggleSelectAll, onArchive,
  statusFilter,
}: OrdersTableProps) {
  // ── Staged editing state (Point 3a) ──
  const [stagedChanges, setStagedChanges] = useState<Map<string, Record<string, string>>>(new Map());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Search input local state + SYNC with parent prop (Point 1a fix) ──
  const [searchInput, setSearchInput] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CRITICAL: Sync local searchInput when parent resets search
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearchChange(value), 300);
  }, [onSearchChange]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ── Staged editing helpers ──
  const isStaged = (orderId: string, field: string) =>
    stagedChanges.get(orderId)?.[field] !== undefined;

  const getStagedValue = (orderId: string, field: string, original: string) =>
    stagedChanges.get(orderId)?.[field] ?? original;

  const stageChange = (orderId: string, field: string, value: string) => {
    setStagedChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(orderId) || {};
      if (value === orders.find(o => o.id === orderId)?.[field as keyof Order]) {
        // Value reverted to original → remove from staged
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(orderId);
        } else {
          next.set(orderId, rest);
        }
      } else {
        next.set(orderId, { ...existing, [field]: value });
      }
      return next;
    });
  };

  const restoreCell = (orderId: string, field: string) => {
    setStagedChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(orderId);
      if (existing) {
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(orderId);
        } else {
          next.set(orderId, rest);
        }
      }
      return next;
    });
  };

  const clearStaged = () => setStagedChanges(new Map());

  const handleSaveAll = async () => {
    if (stagedChanges.size === 0) return;
    setSaving(true);
    try {
      for (const [orderId, fields] of stagedChanges) {
        const body: Record<string, unknown> = { ...fields };
        if (fields.productQuantity !== undefined) {
          body.productQuantity = parseInt(fields.productQuantity, 10) || 1;
        }
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Failed to update order ${orderId}`);
      }
      setStagedChanges(new Map());
      toast.success(t.cellSaveSuccess);
      onCellUpdated();
    } catch {
      toast.error(t.cellSaveError);
    } finally {
      setSaving(false);
    }
  };

  // ── Cell double-click → edit ──
  const startEdit = (orderId: string, field: EditableField, currentValue: string) => {
    setEditingCell(`${orderId}:${field}`);
    setEditValue(getStagedValue(orderId, field, currentValue));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const [orderId, field] = editingCell.split(':') as [string, EditableField];
    if (editValue !== orders.find(o => o.id === orderId)?.[field as keyof Order]) {
      stageChange(orderId, field, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // ── Render editable cell ──
  const renderEditableCell = (order: Order, field: EditableField, displayValue: string) => {
    const cellKey = `${order.id}:${field}`;
    const isEditing = editingCell === cellKey;
    const hasStaged = isStaged(order.id, field);
    const currentValue = getStagedValue(order.id, field, displayValue);

    if (isEditing) {
      return (
        <Input
          className="h-7 text-xs px-1"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
        />
      );
    }

    // Staged cell → amber bg + green dot + popover with old/new value + restore
    if (hasStaged) {
      const originalValue = String(order[field as keyof Order]);
      return (
        <Popover>
          <PopoverTrigger asChild>
            <span
              className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
              onDoubleClick={() => startEdit(order.id, field, displayValue)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs truncate max-w-[120px]">{currentValue || '—'}</span>
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-56 text-xs p-3" side="bottom" align="start">
            <div className="space-y-2">
              <p className="text-muted-foreground font-medium text-[11px] uppercase tracking-wide">
                {field}
              </p>
              <div className="space-y-1">
                <p className="text-red-600 line-through">
                  {t.oldValue} : {originalValue || '—'}
                </p>
                <p className="text-green-700 font-medium">
                  {t.newValue} : {currentValue || '—'}
                </p>
              </div>
              <div className="flex gap-1 pt-1 border-t">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => restoreCell(order.id, field)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {t.restore}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    // Normal cell → double-click to edit
    return (
      <span
        className="cursor-default hover:bg-muted/50 rounded px-1.5 py-0.5 transition-colors"
        onDoubleClick={() => startEdit(order.id, field, displayValue)}
      >
        {displayValue || '—'}
      </span>
    );
  };

  // ── Pagination buttons (FX31) ──
  const pageButtons = generatePageButtons(page + 1, totalPages);

  const startIdx = page * 10 + 1;
  const endIdx = Math.min((page + 1) * 10, total);

  return (
    <div className="space-y-3">
      {/* ── Search bar ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t.search}
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* ── Staged changes bar (Point 3a) ── */}
      {stagedChanges.size > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <span className="text-xs font-medium text-amber-800">
            {t.modifiedCount.replace('{count}', String(stagedChanges.size))}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveAll}
              disabled={saving}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {t.saveAll}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={clearStaged}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              {t.cancelAll}
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {/* FX29 fix: stopPropagation on TableCell onClick, not on CheckedChange */}
              <TableCell
                className="w-10"
                onClick={e => e.stopPropagation()}
              >
                <Checkbox
                  checked={orders.length > 0 && orders.every(o => selectedIds.has(o.id))}
                  onCheckedChange={() => onToggleSelectAll()}
                />
              </TableCell>
              <TableHead className="text-xs">{t.date}</TableHead>
              <TableHead className="text-xs">{t.customer}</TableHead>
              <TableHead className="text-xs">{t.phone}</TableHead>
              <TableHead className="text-xs">{t.city}</TableHead>
              <TableHead className="text-xs">{t.product}</TableHead>
              <TableHead className="text-xs">{t.color}</TableHead>
              <TableHead className="text-xs">{t.size}</TableHead>
              <TableHead className="text-xs text-right">{t.price}</TableHead>
              <TableHead className="text-xs text-center">{t.qty}</TableHead>
              <TableCell
                className="text-xs font-medium"
                onClick={e => e.stopPropagation()}
              >
                {t.statusCol}
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                  <p className="font-medium">{t.noResults}</p>
                  <p className="text-xs mt-1">{t.noResultsDesc}</p>
                </TableCell>
              </TableRow>
            ) : (
              orders.map(order => {
                const isSelected = selectedIds.has(order.id);
                return (
                  <TableRow
                    key={order.id}
                    data-state={isSelected ? 'selected' : undefined}
                    className="cursor-pointer"
                  >
                    {/* FX29: stopPropagation on the checkbox cell */}
                    <TableCell
                      className="w-10"
                      onClick={e => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(order.id)}
                      />
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </TableCell>

                    {/* Customer name — editable */}
                    <TableCell className="text-xs font-medium">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'customerName', order.customerName)}
                      </div>
                    </TableCell>

                    {/* Phone — editable */}
                    <TableCell className="text-xs">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'customerPhone', order.customerPhone)}
                      </div>
                    </TableCell>

                    {/* City — editable */}
                    <TableCell className="text-xs">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'customerCity', order.customerCity)}
                      </div>
                    </TableCell>

                    {/* Product — editable */}
                    <TableCell className="text-xs">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'productName', order.productName)}
                        <DataQualityIcon value={order.productName} field="productName" />
                      </div>
                    </TableCell>

                    {/* Color — editable + DataQualityIcon (Point 3c) */}
                    <TableCell className="text-xs">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'productColor', order.productColor)}
                        <DataQualityIcon value={order.productColor} field="productColor" />
                      </div>
                    </TableCell>

                    {/* Size — editable + DataQualityIcon (Point 3c) */}
                    <TableCell className="text-xs">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'productSize', order.productSize)}
                        <DataQualityIcon value={order.productSize} field="productSize" />
                      </div>
                    </TableCell>

                    {/* Price — editable + DataQualityIcon */}
                    <TableCell className="text-xs text-right font-mono">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'productPrice', order.productPrice)}
                        <DataQualityIcon value={order.productPrice} field="productPrice" />
                      </div>
                    </TableCell>

                    {/* Quantity — editable */}
                    <TableCell className="text-xs text-center">
                      <div onClick={e => e.stopPropagation()}>
                        {renderEditableCell(order, 'productQuantity', String(order.productQuantity))}
                      </div>
                    </TableCell>

                    {/* Status — not editable, stopPropagation (FX29) */}
                    <TableCell
                      className="text-xs"
                      onClick={e => e.stopPropagation()}
                    >
                      <Badge variant={statusVariant(order.status)}>
                        {statusLabel(order.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Footer: info + pagination + CA + archive ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: info + CA */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {t.showing} {startIdx}–{endIdx} {t.of2} {total} {t.results}
          </span>
          <span className="font-semibold text-foreground">
            {t.ca} : <span className="font-mono">{ca.toLocaleString('fr-FR')} MAD</span>
          </span>
        </div>

        {/* Center: pagination (FX31 sliding window) */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            {t.prevPage}
          </Button>
          {pageButtons.map((p, i) =>
            p === '...' ? (
              <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={p === page + 1 ? 'default' : 'outline'}
                size="sm"
                className="h-7 w-7 p-0 text-xs"
                onClick={() => onPageChange(p - 1)}
              >
                {p}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            {t.nextPage}
          </Button>
        </div>

        {/* Right: archive button */}
        {selectedIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onArchive(Array.from(selectedIds))}
          >
            <Archive className="w-3.5 h-3.5 mr-1" />
            {t.archive} ({selectedIds.size})
          </Button>
        )}
      </div>
    </div>
  );
}