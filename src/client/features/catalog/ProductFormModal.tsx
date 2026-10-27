import { useEffect, useState } from 'hono/jsx/dom'
import { PRODUCT_UNITS } from '../../../shared/constants.js'
import { formatRupiah, parseDigitsToInt } from '../../../shared/formatters.js'
import type { CategoryDTO, ProductDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface ProductFormModalProps {
  readonly open: boolean
  readonly editingProduct: ProductDTO | null
  readonly categories: readonly CategoryDTO[]
  readonly onClose: () => void
  readonly onSaved: () => void
}

export function ProductFormModal(props: ProductFormModalProps) {
  const { showToast } = useToast()
  const isEdit = props.editingProduct !== null

  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [categoryIdStr, setCategoryIdStr] = useState('')
  const [unit, setUnit] = useState<string>(PRODUCT_UNITS[0])
  const [costPrice, setCostPrice] = useState(0)
  const [sellPrice, setSellPrice] = useState(0)
  const [initialStockStr, setInitialStockStr] = useState('0')
  const [minStockStr, setMinStockStr] = useState('5')
  const [isActive, setIsActive] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!props.open) return
    const prod = props.editingProduct
    if (prod) {
      setSku(prod.sku)
      setBarcode(prod.barcode ?? '')
      setName(prod.name)
      setCategoryIdStr(prod.categoryId !== null ? String(prod.categoryId) : '')
      setUnit(prod.unit)
      setCostPrice(prod.costPrice ?? 0)
      setSellPrice(prod.sellPrice)
      setMinStockStr(String(prod.minStockQty))
      setIsActive(prod.isActive)
    } else {
      setSku('')
      setBarcode('')
      setName('')
      setCategoryIdStr('')
      setUnit(PRODUCT_UNITS[0])
      setCostPrice(0)
      setSellPrice(0)
      setInitialStockStr('0')
      setMinStockStr('5')
      setIsActive(true)
    }
    setErrorMessage(null)
  }, [props.open, props.editingProduct])

  const unitMargin = sellPrice - costPrice
  const marginPct = sellPrice > 0 ? Math.round((unitMargin / sellPrice) * 100) : 0

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorMessage(null)
    setSaving(true)

    const categoryId =
      categoryIdStr.trim() !== '' ? Number.parseInt(categoryIdStr, 10) : null
    const minStockQty = parseDigitsToInt(minStockStr)
    const initialStock = parseDigitsToInt(initialStockStr)

    try {
      if (isEdit && props.editingProduct) {
        await api.products.update(props.editingProduct.id, {
          sku: sku.trim().toUpperCase(),
          barcode: barcode.trim() || null,
          name: name.trim(),
          categoryId,
          unit: unit.trim().toLowerCase(),
          costPrice,
          sellPrice,
          minStockQty,
          isActive,
        })
        showToast('Data produk berhasil diperbarui.', 'success')
      } else {
        await api.products.create({
          sku: sku.trim().toUpperCase(),
          barcode: barcode.trim() || null,
          name: name.trim(),
          categoryId,
          unit: unit.trim().toLowerCase(),
          costPrice,
          sellPrice,
          initialStock,
          minStockQty,
        })
        showToast('Produk baru berhasil ditambahkan.', 'success')
      }
      props.onSaved()
      props.onClose()
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError ? err.message : 'Gagal menyimpan produk.',
      )
    } finally {
      setSaving(false)
    }
  }

  const categoryOptions = [
    { value: '', label: 'Tanpa Kategori' },
    ...props.categories.map((c) => ({ value: String(c.id), label: c.name })),
  ]

  const unitOptions = PRODUCT_UNITS.map((u) => ({
    value: u,
    label: u.toUpperCase(),
  }))

  return (
    <Modal
      open={props.open}
      title={isEdit ? 'Ubah Produk' : 'Tambah Produk Baru'}
      description={
        isEdit
          ? 'Perubahan saldo stok wajib melalui menu Mutasi Stok agar histori audit tetap terjaga.'
          : 'Daftarkan produk beserta HPP dan stok awalnya.'
      }
      maxWidthClass="max-w-2xl"
      onClose={props.onClose}
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-4">
        {errorMessage && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Kode SKU"
            placeholder="Contoh: MKN-001"
            value={sku}
            onValueChange={(val) => setSku(val.toUpperCase())}
            required
          />
          <TextField
            label="Barcode EAN / UPC (Opsional)"
            placeholder="Contoh: 8992761134012"
            value={barcode}
            onValueChange={setBarcode}
          />
        </div>

        <TextField
          label="Nama Produk"
          placeholder="Contoh: Kopi Arabika Gayo 250g"
          value={name}
          onValueChange={setName}
          required
        />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Kategori"
            value={categoryIdStr}
            options={categoryOptions}
            onValueChange={setCategoryIdStr}
          />
          <SelectField
            label="Satuan Jual"
            value={unit}
            options={unitOptions}
            onValueChange={setUnit}
            required
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MoneyField
            label="Harga Beli / HPP"
            value={costPrice}
            onValueChange={setCostPrice}
            required
          />
          <MoneyField
            label="Harga Jual Kasir"
            value={sellPrice}
            onValueChange={setSellPrice}
            required
          />
        </div>

        <div class="rounded-xl bg-m3-surface-container-low px-3.5 py-2.5 flex items-center justify-between text-xs">
          <span class="text-m3-on-surface-variant">Estimasi Margin per Unit:</span>
          <span
            class={[
              'font-semibold tabular-nums',
              unitMargin >= 0 ? 'text-m3-success' : 'text-m3-danger',
            ].join(' ')}
          >
            {formatRupiah(unitMargin)} ({marginPct}%)
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isEdit ? (
            <TextField
              label="Stok Awal"
              inputMode="numeric"
              value={initialStockStr}
              onValueChange={(v) => setInitialStockStr(String(parseDigitsToInt(v)))}
              helperText="Otomatis dicatat sebagai mutasi INITIAL."
            />
          ) : (
            <SelectField
              label="Status Produk"
              value={isActive ? 'active' : 'archived'}
              options={[
                { value: 'active', label: 'Aktif (Tampil di Kasir)' },
                { value: 'archived', label: 'Diarsipkan (Nonaktif)' },
              ]}
              onValueChange={(val) => setIsActive(val === 'active')}
            />
          )}

          <TextField
            label="Batas Minimum Peringatan Stok"
            inputMode="numeric"
            value={minStockStr}
            onValueChange={(v) => setMinStockStr(String(parseDigitsToInt(v)))}
            helperText="Muncul peringatan saat stok mencapai angka ini."
          />
        </div>

        <div class="pt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Simpan Perubahan' : 'Simpan Produk'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
