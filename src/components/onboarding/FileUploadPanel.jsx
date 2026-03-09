import { useRef, useState } from 'react';

export default function FileUploadPanel({ uploadedFile, onFileSelected }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    onFileSelected(file);
  }

  return (
    <div className="space-y-4">
      {uploadedFile ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
              Uploaded roster
            </div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
              {uploadedFile.name}
            </div>
          </div>
          <button
            className="rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            Upload Roster Again
          </button>
        </div>
      ) : (
        <div
          className={`rounded-2xl border-2 border-dashed px-5 py-10 text-center transition ${
            isDragging
              ? 'border-[color:var(--brand)] bg-[color:var(--surface-soft)]'
              : 'border-[color:var(--line)] bg-white'
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <div className="text-base font-semibold text-[color:var(--ink)]">
            Drag and drop a roster CSV
          </div>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            CSV is supported in this build. If your source file is XLSX, save it as CSV first.
          </div>
          <button
            className="mt-5 rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)]"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".csv"
        onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
