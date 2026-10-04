'use client';

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { adminApi, type ImportSummaryLike } from '@/lib/api/admin-client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type BackupShape = { categories: unknown[]; items: unknown[] };

type DataToolsProps = {
  onImported: () => void;
  onNotice: (notice: { kind: 'info' | 'error'; text: string }) => void;
};

/**
 * Backup / restore panel.
 *  - Export downloads every category + item as JSON
 *  - Import validates the file first, never overwrites silently, and demands
 *    an explicit confirmation before replacing existing data.
 */
export function DataTools({ onImported, onNotice }: DataToolsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileData, setFileData] = useState<BackupShape | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setFileData(null);
    setFileName('');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ''));
        const candidate = parsed as Partial<BackupShape> | null;
        if (
          !candidate ||
          !Array.isArray(candidate.categories) ||
          !Array.isArray(candidate.items)
        ) {
          setError(
            'Invalid backup file: it must contain the "categories" and "items" lists.',
          );
          return;
        }
        setFileData({ categories: candidate.categories, items: candidate.items });
        setFileName(file.name);
      } catch {
        setError('Unreadable file: this is not valid JSON.');
      }
    };
    reader.onerror = () => setError('Unable to read this file.');
    reader.readAsText(file);
  }

  function describeSummary(summary: ImportSummaryLike): string {
    const parts = [
      `${summary.categories.created} category/categories imported`,
      `${summary.items.created} resource(s) imported`,
    ];
    if (summary.categories.skipped > 0) parts.push(`${summary.categories.skipped} skipped`);
    if (summary.items.skipped > 0) parts.push(`${summary.items.skipped} skipped`);
    if (summary.items.unclassified > 0) {
      parts.push(`${summary.items.unclassified} resource(s) without a category`);
    }
    return `Import finished (${summary.mode === 'replace' ? 'replace' : 'merge'}): ${parts.join(', ')}.`;
  }

  async function runImport() {
    if (!fileData) return;
    setBusy(true);
    const result = await adminApi.importData({
      mode,
      confirm: mode === 'replace',
      data: fileData,
    });
    setBusy(false);
    setConfirmOpen(false);
    if (!result.ok) {
      setError(result.issues?.length ? result.issues.join(' ') : result.message);
      return;
    }
    setError(null);
    setFileData(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onNotice({ kind: 'info', text: describeSummary(result.data.summary) });
    onImported();
  }

  function handleImportClick() {
    if (!fileData) return;
    if (mode === 'replace') {
      setConfirmOpen(true);
      return;
    }
    void runImport();
  }

  return (
    <section aria-labelledby="data-title" className="mt-14">
      <h2 id="data-title" className="section-title">
        Data &amp; backup
      </h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <h3 className="text-base font-medium tracking-tight text-paper">Export</h3>
          <p className="field-hint">
            Downloads every category and resource as a JSON file (keep it somewhere safe, and
            import it to restore).
          </p>
          <a href="/api/export" download className="btn mt-4">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export data (JSON)
          </a>
        </div>

        <div className="panel p-4 sm:p-5">
          <h3 className="text-base font-medium tracking-tight text-paper">Import</h3>
          <p className="field-hint">
            Restores a JSON backup. Existing data is never overwritten without explicit
            confirmation.
          </p>

          <div className="mt-4">
            <label className="field-label" htmlFor="import-file">
              Backup file (JSON)
            </label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept="application/json,.json"
              className="field-input cursor-pointer file:mr-3 file:rounded-sm file:border-0 file:bg-paper/10 file:px-2.5 file:py-1.5 file:text-xs file:text-paper/80"
              onChange={handleFileChange}
            />
            {fileName ? (
              <p className="field-hint">
                Selected file: <span className="text-paper/70">{fileName}</span> (
                {fileData ? `${fileData.categories.length} category/categories, ${fileData.items.length} resource(s)` : '—'}
                )
              </p>
            ) : null}
          </div>

          <fieldset className="mt-4">
            <legend className="field-label">Import mode</legend>
            <label className="flex items-start gap-2.5 text-sm text-paper/75">
              <input
                type="radio"
                name="import-mode"
                className="mt-1 accent-paper/70"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                Merge — adds the file’s items, skips those that already exist.
              </span>
            </label>
            <label className="mt-3 flex items-start gap-2.5 text-sm text-paper/75">
              <input
                type="radio"
                name="import-mode"
                className="mt-1 accent-paper/70"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <span>
                Replace all — <strong>erases</strong> the current data, then imports the file.
              </span>
            </label>
          </fieldset>

          {error ? (
            <p role="alert" className="field-error">
              ⚠ {error}
            </p>
          ) : null}

          <button
            type="button"
            className="btn mt-4"
            onClick={handleImportClick}
            disabled={!fileData || busy}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          busy={busy}
          options={{
            title: 'Replace all data?',
            confirmLabel: 'Replace everything',
            message: (
              <>
                <p>
                  Every current category and resource will be <strong>permanently deleted</strong>,
                  then the file “{fileName}” will be imported.
                </p>
                <p className="mt-2 text-paper/60">
                  This action cannot be undone. Remember to export your current data before
                  continuing.
                </p>
              </>
            ),
          }}
          onConfirm={() => void runImport()}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
    </section>
  );
}
