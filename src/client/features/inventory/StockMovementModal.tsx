import { useEffect, useState } from 'hono/jsx/dom'
import { formatInteger, parseDigitsToInt } from '../../../shared/formatters.js'
import type { RecordStockMovementInput } from '../../../shared/schemas/index.js'
import type { ProductDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface StockMovementModalProps {
  readonly open: boolean
  readonly preselectedProduct: ProductDTO | null
  readonly products: readonly ProductDTO[]
  readonly onClose: () => void
  readonly onRecorded: () => void
}

type ManualType = 'IN_PURCHASE' | 'ADJUSTMENT_OPNAME' | 'OUT_DAMAGED'

export function StockMovementModal(props: StockMovementModalProps) {
  const { showToast } = useToast()

  const [productIdStr, setProductIdStr] = useState('')
  const [movementType, setMovementType] = useState<ManualType>('IN_PURCHASE')
  const [qtyStr, setQtyStr] = useState('1')
  const [actualStockStr, setActualStockStr] = useState('0')
  const [unitCost, setUnitCost] = useState(0)
  const [updateCostFlag, setUpdateCostFlag] = useState(false)
  const [note, setNote] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!props.open) return
    const target =
      props.preselectedProduct ?? props.products.find((p) => p.isActive) ?? null
    setProductIdStr(target ? String(target.id) : '')
    setMovementType('IN_PURCHASE')
    setQtyStr('1')
    setActualStockStr(target ? String(target.stockQty) : '0')
    setUnitCost(target?.costPrice ?? 0)
    setUpdateCostFlag(false)
    setNote('')
    setErrorMessage(null)
  }, [props.open, props.preselectedProduct])

  const activeProducts = props.products.filter((p) => p.isActive)
  const selectedProduct =
    activeProducts.find((p) => String(p.id) === productIdStr) ?? props.preselectedProduct

  const parsedQty = parseDigitsToInt(qtyStr)
  const parsedActual = parseDigitsToInt(actualStockStr)

  const currentStock = selectedProduct?.stockQty ?? 0
  const projectedStock =
    movementType === 'IN_PURCHASE'
      ? currentStock + parsedQty
      : movementType === 'OUT_DAMAGED'
        ? currentStock - parsedQty
        : parsedActual

  const projectedDelta = projectedStock - currentStock

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!selectedProduct) {
      setErrorMessage('Pilih produk terlebih dahulu.')
      return
    }
    if (movementType !== 'IN_PURCHASE' && note.trim().length < 3) {
      setErrorMessage(
        'Alasan / catatan mutasi wajib diisi minimal 3 karakter untuk audit.',
      )
      return
    }
    setErrorMessage(null)
    setSaving(true)

    try {
      let payload: RecordStockMovementInput
      if (movementType === 'IN_PURCHASE') {
        payload = {
          productId: selectedProduct.id,
          movementType: 'IN_PURCHASE',
          quantity: parsedQty,
          ...(updateCostFlag ? { unitCost } : {}),
          note: note.trim() || null,
        }
      } else if (movementType === 'OUT_DAMAGED') {
        payload = {
          productId: selectedProduct.id,
          movementType: 'OUT_DAMAGED',
          quantity: parsedQty,
          note: note.trim(),
        }
      } else {
        payload = {
          productId: selectedProduct.id,
          movementType: 'ADJUSTMENT_OPNAME',
          actualStockQty: parsedActual,
          note: note.trim(),
        }
      }

      await api.inventory.recordMovement(payload)
      showToast('Mutasi stok berhasil dicatat ke Kartu Stok.', 'success')
      props.onRecorded()
      props.onClose()
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError ? err.message : 'Gagal mencatat mutasi stok.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={props.open}
      title="Catat Mutasi Stok"
      description="Setiap perubahan stok akan disimpan permanen di Kartu Stok (Audit Ledger)."
      maxWidthClass="max-w-lg"
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            type="submit"
            form="stock-movement-form"
            loading={saving}
            disabled={!selectedProduct || projectedStock < 0}
          >
            Simpan Mutasi
          </Button>
        </>
      }
    >
      <form id="stock-movement-form" onSubmit={handleSubmit} class="flex flex-col gap-4">
        {errorMessage && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {props.preselectedProduct ? (
          <div class="rounded-2xl bg-m3-surface-container-low p-3.5 text-xs">
            <p class="font-semibold text-m3-on-surface">
              {props.preselectedProduct.name}
            </p>
            <p class="text-m3-on-surface-variant mt-0.5 tabular-nums">
              SKU: {props.preselectedProduct.sku} · Stok saat ini:{' '}
              <strong>
                {formatInteger(props.preselectedProduct.stockQty)}{' '}
                {props.preselectedProduct.unit}
              </strong>
            </p>
          </div>
        ) : (
          <SelectField
            label="Pilih Produk Aktif"
            value={productIdStr}
            options={activeProducts.map((p) => ({
              value: String(p.id),
              label: `${p.sku} — ${p.name} (Stok: ${p.stockQty} ${p.unit})`,
            }))}
            onValueChange={(nextId) => {
              setProductIdStr(nextId)
              const found = activeProducts.find((p) => String(p.id) === nextId)
              if (found) {
                setActualStockStr(String(found.stockQty))
                setUnitCost(found.costPrice ?? 0)
              }
            }}
            required
          />
        )}

        <SelectField
          label="Jenis Mutasi"
          value={movementType}
          options={[
            { value: 'IN_PURCHASE', label: 'Stok Masuk (Pembelian / Restock)' },
            { value: 'ADJUSTMENT_OPNAME', label: 'Penyesuaian Stok Opname Fisik' },
            { value: 'OUT_DAMAGED', label: 'Pengurangan Barang Rusak / Kedaluwarsa' },
          ]}
          onValueChange={(v) => setMovementType(v as ManualType)}
          required
        />

        {movementType === 'ADJUSTMENT_OPNAME' ? (
          <TextField
            label={`Hasil Hitung Stok Fisik Aktual (${selectedProduct?.unit ?? 'unit'})`}
            inputMode="numeric"
            value={actualStockStr}
            onValueChange={(v) => setActualStockStr(String(parseDigitsToInt(v)))}
            helperText="Masukkan jumlah fisik riil di rak gudang."
            required
          />
        ) : (
          <TextField
            label={
              movementType === 'IN_PURCHASE'
                ? `Jumlah Masuk (${selectedProduct?.unit ?? 'unit'})`
                : `Jumlah Keluar (${selectedProduct?.unit ?? 'unit'})`
            }
            inputMode="numeric"
            value={qtyStr}
            onValueChange={(v) => setQtyStr(String(parseDigitsToInt(v)))}
            required
          />
        )}

        {movementType === 'IN_PURCHASE' && (
          <div class="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-m3-surface-container-low">
            <label class="inline-flex items-center gap-2 text-xs font-medium text-m3-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={updateCostFlag}
                onChange={(e) =>
                  setUpdateCostFlag((e.currentTarget as HTMLInputElement).checked)
                }
                class="w-4 h-4 accent-m3-primary rounded cursor-pointer"
              />
              <span>Perbarui HPP rata-rata tertimbang dengan harga beli baru</span>
            </label>

            {updateCostFlag && (
              <MoneyField
                label="Harga Beli Satuan Batch Ini"
                value={unitCost}
                onValueChange={setUnitCost}
              />
            )}
          </div>
        )}

        <TextField
          label={
            movementType === 'IN_PURCHASE'
              ? 'Catatan / No. Surat Jalan (Opsional)'
              : 'Alasan Penyesuaian / Pengurangan'
          }
          placeholder={
            movementType === 'IN_PURCHASE'
              ? 'Contoh: Restock supplier pekan ke-4'
              : 'Wajib diisi minimal 3 karakter untuk audit'
          }
          value={note}
          onValueChange={setNote}
          required={movementType !== 'IN_PURCHASE'}
        />

        {selectedProduct && (
          <div class="rounded-2xl border border-m3-outline-variant/70 px-4 py-3 flex items-center justify-between text-xs tabular-nums">
            <span class="text-m3-on-surface-variant">Pratinjau Saldo Stok:</span>
            <span class="font-semibold text-m3-on-surface">
              {formatInteger(currentStock)} →{' '}
              <span
                class={
                  projectedStock < 0
                    ? 'text-m3-danger'
                    : projectedDelta > 0
                      ? 'text-m3-success'
                      : projectedDelta < 0
                        ? 'text-m3-warning'
                        : ''
                }
              >
                {formatInteger(projectedStock)} {selectedProduct.unit}
              </span>{' '}
              ({projectedDelta >= 0 ? `+${projectedDelta}` : projectedDelta})
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}
