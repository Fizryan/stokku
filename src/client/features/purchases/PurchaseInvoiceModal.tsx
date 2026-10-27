import { useCallback, useEffect, useMemo, useState } from 'hono/jsx/dom'
import type { PurchasePaymentStatus } from '../../../shared/constants.js'
import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { ProductDTO, PurchaseDetailDTO, SupplierDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { IconPlus, IconTrash } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface PurchaseInvoiceModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onPurchaseCreated: (created: PurchaseDetailDTO) => void
  readonly onManageSuppliersClick: () => void
}

interface ItemLine {
  productId: number | null
  qty: number
  unitCost: number
}

export function PurchaseInvoiceModal(props: PurchaseInvoiceModalProps) {
  const { showToast } = useToast()

  const [suppliers, setSuppliers] = useState<readonly SupplierDTO[]>([])
  const [products, setProducts] = useState<readonly ProductDTO[]>([])
  const [loadingLookups, setLoadingLookups] = useState(false)

  // Invoice Header
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentStatus>('PAID')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  // Invoice Items
  const [items, setItems] = useState<ItemLine[]>([
    { productId: null, qty: 1, unitCost: 0 },
  ])

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadLookups = useCallback(async () => {
    setLoadingLookups(true)
    try {
      const [supList, prodList] = await Promise.all([
        api.suppliers.listActive(),
        api.products.list({ status: 'active', pageSize: 100 }),
      ])
      setSuppliers(supList)
      setProducts(prodList.items)

      if (supList.length > 0 && supplierId === null) {
        setSupplierId(supList[0]?.id ?? null)
      }
    } catch {
      showToast('Gagal memuat data supplier atau produk.', 'error')
    } finally {
      setLoadingLookups(false)
    }
  }, [supplierId, showToast])

  useEffect(() => {
    if (props.open) {
      void loadLookups()
      setInvoiceNumber('')
      setPaymentStatus('PAID')
      setDueDate('')
      setNotes('')
      setItems([{ productId: null, qty: 1, unitCost: 0 }])
      setErrorMessage(null)
    }
  }, [props.open, loadLookups])

  const productMap = useMemo(() => {
    const map = new Map<number, ProductDTO>()
    for (const p of products) {
      map.set(p.id, p)
    }
    return map
  }, [products])

  const totalCalculations = useMemo(() => {
    let subtotal = 0
    let totalQty = 0
    for (const line of items) {
      if (line.productId && line.qty > 0) {
        subtotal += line.qty * line.unitCost
        totalQty += line.qty
      }
    }
    return { subtotal, totalQty }
  }, [items])

  const addLine = () => {
    setItems((prev) => [...prev, { productId: null, qty: 1, unitCost: 0 }])
  }

  const removeLine = (idx: number) => {
    if (items.length <= 1) {
      showToast('Faktur minimal harus memuat satu item barang.', 'warning')
      return
    }
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateLineProduct = (idx: number, prodId: number) => {
    const prod = productMap.get(prodId)
    setItems((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line
        return {
          ...line,
          productId: prodId,
          unitCost: prod?.costPrice ?? line.unitCost,
        }
      }),
    )
  }

  const updateLineQty = (idx: number, qty: number) => {
    setItems((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, qty: Math.max(1, qty) } : line)),
    )
  }

  const updateLineCost = (idx: number, unitCost: number) => {
    setItems((prev) =>
      prev.map((line, i) =>
        i === idx ? { ...line, unitCost: Math.max(0, unitCost) } : line,
      ),
    )
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()

    if (!supplierId) {
      setErrorMessage('Pilih supplier terlebih dahulu.')
      return
    }

    if (!invoiceNumber.trim()) {
      setErrorMessage('Nomor faktur / surat jalan supplier wajib diisi.')
      return
    }

    const validItems: Array<{ productId: number; qty: number; unitCost: number }> = []
    for (let i = 0; i < items.length; i++) {
      const line = items[i]
      if (!line?.productId) {
        setErrorMessage(`Baris #${i + 1}: Silakan pilih produk.`)
        return
      }
      if (line.qty <= 0) {
        setErrorMessage(`Baris #${i + 1}: Kuantitas harus minimal 1.`)
        return
      }
      validItems.push({
        productId: line.productId,
        qty: line.qty,
        unitCost: line.unitCost,
      })
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const created = await api.purchases.create({
        invoiceNumber: invoiceNumber.trim(),
        supplierId,
        paymentStatus,
        dueDate: paymentStatus === 'UNPAID' && dueDate ? dueDate : null,
        notes: notes.trim() || null,
        items: validItems,
      })

      showToast(
        `Faktur pembelian ${created.invoiceNumber} berhasil disimpan. Stok bertambah secara otomatis!`,
        'success',
      )
      props.onPurchaseCreated(created)
      props.onClose()
    } catch (err) {
      const msg =
        err instanceof ClientApiError ? err.message : 'Gagal mencatat faktur pembelian.'
      setErrorMessage(msg)
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Catat Faktur Pembelian Supplier (Restock)"
      maxWidthClass="max-w-4xl"
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-5">
        {errorMessage && (
          <div class="p-3 rounded-xl bg-m3-danger-container/60 border border-m3-danger/40 text-xs text-m3-danger font-medium">
            {errorMessage}
          </div>
        )}

        {/* Invoice Header Details */}
        <div class="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/60 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div class="md:col-span-4 flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <label
                htmlFor="purchase-supplier-select"
                class="font-medium text-m3-on-surface-variant"
              >
                Pemasok / Supplier *
              </label>
              <button
                type="button"
                onClick={props.onManageSuppliersClick}
                class="text-[11px] text-m3-primary hover:underline cursor-pointer"
              >
                + Kelola Supplier
              </button>
            </div>
            <select
              id="purchase-supplier-select"
              value={supplierId !== null ? String(supplierId) : ''}
              onChange={(e) => {
                const val = (e.currentTarget as HTMLSelectElement).value
                setSupplierId(val ? Number.parseInt(val, 10) : null)
              }}
              disabled={submitting || loadingLookups}
              class="h-10 px-3 rounded-xl bg-m3-surface border border-m3-outline-variant text-m3-on-surface text-xs focus:outline-m3-primary"
            >
              <option value="">-- Pilih Pemasok --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div class="md:col-span-4">
            <TextField
              label="Nomor Faktur / Surat Jalan *"
              placeholder="FAKTUR-202610-001"
              value={invoiceNumber}
              onValueChange={setInvoiceNumber}
              disabled={submitting}
              required
            />
          </div>

          <div class="md:col-span-2">
            <SelectField
              label="Status Pembayaran"
              value={paymentStatus}
              onValueChange={(val) => setPaymentStatus(val as PurchasePaymentStatus)}
              options={[
                { value: 'PAID', label: 'Lunas (Tunai/Transfer)' },
                { value: 'UNPAID', label: 'Hutang / Tempo' },
              ]}
            />
          </div>

          <div class="md:col-span-2">
            <TextField
              label="Jatuh Tempo (Tempo)"
              type="date"
              value={dueDate}
              onValueChange={setDueDate}
              disabled={paymentStatus !== 'UNPAID' || submitting}
            />
          </div>

          <div class="md:col-span-12">
            <TextField
              label="Catatan Pembelian (Opsional)"
              placeholder="Keterangan pengiriman, nomor resi ekspedisi, armada..."
              value={notes}
              onValueChange={setNotes}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Multi-Item Table */}
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-m3-on-surface uppercase tracking-wider">
              Daftar Barang Masuk ({items.length} Item)
            </h3>
            <Button size="sm" variant="tonal" onClick={addLine} disabled={submitting}>
              <IconPlus class="w-3.5 h-3.5 mr-1" />
              Tambah Baris Produk
            </Button>
          </div>

          <div class="rounded-2xl border border-m3-outline-variant/60 overflow-hidden">
            <table class="w-full text-left text-xs text-m3-on-surface">
              <thead class="bg-m3-surface-container text-m3-on-surface-variant border-b border-m3-outline-variant/60">
                <tr>
                  <th class="p-3 font-semibold w-5/12">Pilih Produk</th>
                  <th class="p-3 font-semibold text-center w-2/12">Jumlah Qty</th>
                  <th class="p-3 font-semibold text-right w-3/12">Harga Beli Satuan</th>
                  <th class="p-3 font-semibold text-right w-2/12">Subtotal</th>
                  <th class="p-3 font-semibold text-center w-1/12">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-m3-outline-variant/40 bg-m3-surface">
                {items.map((line, idx) => {
                  const lineSubtotal = line.qty * line.unitCost
                  const matchedProd = line.productId
                    ? productMap.get(line.productId)
                    : null

                  return (
                    <tr key={idx} class="hover:bg-m3-surface-container-low/40">
                      <td class="p-2.5">
                        <select
                          value={line.productId !== null ? String(line.productId) : ''}
                          onChange={(e) => {
                            const val = (e.currentTarget as HTMLSelectElement).value
                            if (val) updateLineProduct(idx, Number.parseInt(val, 10))
                          }}
                          disabled={submitting}
                          class="w-full h-9 px-2.5 rounded-xl bg-m3-surface-container-lowest border border-m3-outline-variant text-xs focus:outline-m3-primary"
                        >
                          <option value="">-- Pilih Produk --</option>
                          {products.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              [{p.sku}] {p.name} (Stok: {p.stockQty} {p.unit})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td class="p-2.5 text-center">
                        <div class="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onInput={(e) => {
                              const val = Number.parseInt(
                                (e.currentTarget as HTMLInputElement).value,
                                10,
                              )
                              updateLineQty(idx, Number.isNaN(val) ? 1 : val)
                            }}
                            disabled={submitting}
                            class="w-20 h-9 text-center rounded-xl bg-m3-surface-container-lowest border border-m3-outline-variant text-xs font-semibold tabular-nums focus:outline-m3-primary"
                          />
                          <span class="text-[11px] text-m3-on-surface-variant font-medium">
                            {matchedProd?.unit ?? 'satuan'}
                          </span>
                        </div>
                      </td>

                      <td class="p-2.5 text-right">
                        <MoneyField
                          label=""
                          value={line.unitCost}
                          onValueChange={(val) => updateLineCost(idx, val)}
                          disabled={submitting}
                        />
                      </td>

                      <td class="p-2.5 text-right font-bold text-m3-on-surface tabular-nums">
                        {formatRupiah(lineSubtotal)}
                      </td>

                      <td class="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={submitting}
                          aria-label={`Hapus baris ${idx + 1}`}
                          class="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-danger hover:bg-m3-danger-container/40 transition-colors cursor-pointer"
                        >
                          <IconTrash class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice Grand Total Summary Card */}
        <Card class="p-4 bg-m3-surface-container-low border-m3-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <p class="font-bold text-m3-on-surface">Rekapitulasi Faktur Masuk</p>
            <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
              Total {formatInteger(totalCalculations.totalQty)} unit barang • HPP produk
              akan dihitung ulang secara otomatis (Weighted-Average Cost).
            </p>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <span class="font-medium text-m3-on-surface-variant">Total Tagihan:</span>
            <span class="text-base sm:text-lg font-bold text-m3-primary tabular-nums">
              {formatRupiah(totalCalculations.subtotal)}
            </span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-m3-outline-variant/50">
          <Button
            type="button"
            variant="ghost"
            onClick={props.onClose}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={totalCalculations.subtotal <= 0 || !invoiceNumber.trim()}
          >
            Simpan Faktur Pembelian & Update Stok
          </Button>
        </div>
      </form>
    </Modal>
  )
}
